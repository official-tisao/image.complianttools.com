const normalizePath = (filename) => filename.replaceAll('\\', '/');

const propertyName = (node) => {
  if (!node.computed && node.property.type === 'Identifier') return node.property.name;
  if (node.computed && node.property.type === 'Literal') return node.property.value;
  return undefined;
};

const isEngineFile = (filename) => normalizePath(filename).includes('/packages/engine/');

const isIdentifierReference = (node) => {
  const parent = node.parent;
  if (!parent) return true;
  if (parent.type === 'MemberExpression' && parent.property === node && !parent.computed)
    return false;
  if (parent.type === 'Property' && parent.key === node && !parent.computed) return false;
  return !(parent.type === 'VariableDeclarator' && parent.id === node);
};

const noDangerousDom = {
  meta: {
    type: 'problem',
    docs: { description: 'Disallow APIs that execute code or inject untrusted HTML.' },
    schema: [],
    messages: { forbidden: '{{name}} is forbidden by the repository security policy.' },
  },
  create(context) {
    return {
      AssignmentExpression(node) {
        if (node.left.type !== 'MemberExpression') return;
        const name = propertyName(node.left);
        if (name === 'innerHTML' || name === 'outerHTML') {
          context.report({ node, messageId: 'forbidden', data: { name } });
        }
      },
      CallExpression(node) {
        if (node.callee.type !== 'MemberExpression') return;
        const name = propertyName(node.callee);
        const isDocumentWrite =
          name === 'write' &&
          node.callee.object.type === 'Identifier' &&
          node.callee.object.name === 'document';
        if (name === 'insertAdjacentHTML' || isDocumentWrite) {
          context.report({
            node,
            messageId: 'forbidden',
            data: { name: isDocumentWrite ? 'document.write' : name },
          });
        }
      },
    };
  },
};

const noEngineBrowserGlobals = {
  meta: {
    type: 'problem',
    docs: { description: 'Keep the engine DOM-free outside the guarded capability probe.' },
    schema: [],
    messages: { forbidden: '{{name}} is only allowed in packages/engine/src/capabilities.ts.' },
  },
  create(context) {
    const filename = normalizePath(context.filename);
    if (!isEngineFile(filename) || filename.endsWith('/src/capabilities.ts')) return {};
    return {
      Identifier(node) {
        if (
          (node.name === 'window' || node.name === 'document' || node.name === 'navigator') &&
          isIdentifierReference(node)
        ) {
          context.report({ node, messageId: 'forbidden', data: { name: node.name } });
        }
      },
    };
  },
};

const noEngineDirectFetch = {
  meta: {
    type: 'problem',
    docs: { description: 'Route all engine network access through ai/transport.ts.' },
    schema: [],
    messages: { forbidden: 'Direct fetch is only allowed in packages/engine/src/ai/transport.ts.' },
  },
  create(context) {
    const filename = normalizePath(context.filename);
    if (!isEngineFile(filename) || filename.endsWith('/src/ai/transport.ts')) return {};
    return {
      CallExpression(node) {
        if (node.callee.type === 'Identifier' && node.callee.name === 'fetch') {
          context.report({ node, messageId: 'forbidden' });
        }
      },
    };
  },
};

export default {
  rules: {
    'no-dangerous-dom': noDangerousDom,
    'no-engine-browser-globals': noEngineBrowserGlobals,
    'no-engine-direct-fetch': noEngineDirectFetch,
  },
};
