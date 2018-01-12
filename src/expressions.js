const scopes = require('taskcluster-lib-scopes');
const _ = require('lodash');

export const splatParams = (scope, params, missing) => scope.replace(/<([^>]+)>/g, (match, param) => {
  const value = _.at(params, param)[0];
  if (value !== undefined) {
    return value;
  }
  missing.push(match); // If any are left undefined, we can't be done yet
  return match;
});

export const expandExpressionTemplate = (template, params, missing) => {
  const key = Object.keys(template)[0];
  let subexpressions = [];
  template[key].forEach(scope => {
    if (typeof scope === 'string') {
      subexpressions.push(splatParams(scope, params, missing));
    } else if (_.isObject(scope) && scope.for && scope.in && scope.each) {
      let subs = _.at(params, scope.in)[0];
      if (!subs) {
        missing.push(scope.in);
        subexpressions.push(scope);
        return;
      }
      subs.forEach(param => {
        subexpressions.push(splatParams(scope.each.replace(`<${scope.for}>`, param), params, missing));
      });
    } else if (_.isObject(scope) && scope.if && scope.then) {
      const conditional = _.at(params, scope.if)[0];
      if (conditional === true) {
        // Only do this if the conditional exists and is literally true
        subexpressions.push(expandExpressionTemplate(scope.then, params, missing));
      } else if (conditional === undefined) {
        // In the case that the conditional is false, do nothing. If it is missing, we say so
        missing.push(scope.if);
      } else if (conditional !== false) {
        throw new error(`conditional values must be booleans! ${scope.if} is a ${typeof scope.if}`);
      }
    } else {
      subexpressions.push(expandExpressionTemplate(scope, params, missing));
    }
  });
  return {[key]: subexpressions};
};
