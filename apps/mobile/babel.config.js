// SDK 58's Hermes V1 profile stopped transpiling parameters, and Hermes V1
// cannot parse an async arrow whose rest parameter is a pattern:
// `async (...[input, options = {}]) => …`, which @orpc/client ships. Expo Go
// then throws "invalid destructuring target" as the API client loads.
// Transpiling parameters again, as the Hermes V0 profile did, fixes it.
// Drop this file once babel-preset-expo or Hermes handles the pattern.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: ['@babel/plugin-transform-parameters'],
  };
};
