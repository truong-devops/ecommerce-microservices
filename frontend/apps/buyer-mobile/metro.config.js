const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const config = getDefaultConfig(projectRoot);

// Workspace packages may be hoisted beside web apps that use a different React major.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'react' || moduleName.startsWith('react/')) {
    return context.resolveRequest(context, path.resolve(projectRoot, 'node_modules', moduleName), platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
