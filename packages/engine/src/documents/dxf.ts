import DxfParser, {
  type IArcEntity,
  type ICircleEntity,
  type ILineEntity,
  type ILwpolylineEntity,
  type IPoint,
  type IPolylineEntity,
} from 'dxf-parser';

export interface DxfSvgResult {
  readonly svg: string;
  readonly width: number;
  readonly height: number;
  readonly warnings: readonly string[];
}

type SupportedEntity =
  ILineEntity | ILwpolylineEntity | IPolylineEntity | ICircleEntity | IArcEntity;

function vertices(entity: SupportedEntity): readonly IPoint[] | undefined {
  return 'vertices' in entity ? entity.vertices : undefined;
}

/** Parses ASCII DXF with the pinned MIT parser and renders its bounded 2D geometry as SVG. */
export function decodeDxfToSvg(input: string | ArrayBuffer | Uint8Array): DxfSvgResult {
  const source =
    typeof input === 'string'
      ? input
      : new TextDecoder().decode(input instanceof Uint8Array ? input : new Uint8Array(input));
  if (source.length === 0 || source.length > 25_000_000)
    throw new Error('DXF source is empty or exceeds the 25 MB parser limit.');
  const parsed = new DxfParser().parseSync(source);
  if (!parsed) throw new Error('DXF parser returned no drawing.');
  if (parsed.entities.length > 100_000) throw new Error('DXF exceeds the safe entity-count limit.');

  const supported: SupportedEntity[] = [];
  const warnings: string[] = [];
  const unsupported = new Map<string, number>();
  for (const entity of parsed.entities) {
    if (['LINE', 'LWPOLYLINE', 'POLYLINE', 'CIRCLE', 'ARC'].includes(entity.type))
      supported.push(entity as SupportedEntity);
    else unsupported.set(entity.type, (unsupported.get(entity.type) ?? 0) + 1);
  }
  for (const [type, count] of unsupported)
    warnings.push(`Skipped ${count} unsupported ${type} ${count === 1 ? 'entity' : 'entities'}.`);
  if (supported.length === 0)
    throw new Error(
      warnings.length > 0
        ? `DXF contains no renderable 2D entities. ${warnings.join(' ')}`
        : 'DXF contains no entities.',
    );

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  const include = (x: number, y: number) => {
    if (!Number.isFinite(x) || !Number.isFinite(y))
      throw new Error('DXF contains non-finite coordinates.');
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };
  for (const entity of supported) {
    const points = vertices(entity);
    if (points) for (const point of points) include(point.x, point.y);
    else if (entity.type === 'CIRCLE' || entity.type === 'ARC') {
      const circular = entity as ICircleEntity | IArcEntity;
      if (!(circular.radius > 0 && Number.isFinite(circular.radius)))
        throw new Error(`DXF ${entity.type} has an invalid radius.`);
      include(circular.center.x - circular.radius, circular.center.y - circular.radius);
      include(circular.center.x + circular.radius, circular.center.y + circular.radius);
    }
  }
  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  if (width * height > 1_000_000_000_000)
    throw new Error('DXF drawing bounds exceed the safe render limit.');

  const elements: string[] = [];
  for (const entity of supported) {
    if (entity.type === 'LINE') {
      const points = (entity as ILineEntity).vertices;
      if (points.length < 2) throw new Error('DXF LINE has fewer than two vertices.');
      elements.push(
        `<path d="M${points.map((point) => `${point.x} ${point.y}`).join(' L')}" fill="none" stroke="currentColor"/>`,
      );
    } else if (entity.type === 'LWPOLYLINE' || entity.type === 'POLYLINE') {
      const polyline = entity as ILwpolylineEntity | IPolylineEntity;
      if (polyline.vertices.length < 2) throw new Error(`DXF ${entity.type} has too few vertices.`);
      const closed = 'shape' in polyline && polyline.shape ? ' Z' : '';
      elements.push(
        `<path d="M${polyline.vertices.map((point) => `${point.x} ${point.y}`).join(' L')}${closed}" fill="none" stroke="currentColor"/>`,
      );
    } else if (entity.type === 'CIRCLE') {
      const circle = entity as ICircleEntity;
      elements.push(
        `<circle cx="${circle.center.x}" cy="${circle.center.y}" r="${circle.radius}" fill="none" stroke="currentColor"/>`,
      );
    } else {
      const arc = entity as IArcEntity;
      const start = {
        x: arc.center.x + Math.cos(arc.startAngle) * arc.radius,
        y: arc.center.y + Math.sin(arc.startAngle) * arc.radius,
      };
      let sweep = arc.endAngle - arc.startAngle;
      if (sweep < 0) sweep += Math.PI * 2;
      const end = {
        x: arc.center.x + Math.cos(arc.endAngle) * arc.radius,
        y: arc.center.y + Math.sin(arc.endAngle) * arc.radius,
      };
      elements.push(
        `<path d="M${start.x} ${start.y} A${arc.radius} ${arc.radius} 0 ${sweep > Math.PI ? 1 : 0} 1 ${end.x} ${end.y}" fill="none" stroke="currentColor"/>`,
      );
    }
  }
  return {
    width,
    height,
    warnings,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" color="black"><g transform="translate(${-minX} ${maxY}) scale(1 -1)">${elements.join('')}</g></svg>`,
  };
}
