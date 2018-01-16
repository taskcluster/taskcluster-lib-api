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
  if (typeof template === 'string') {
    return splatParams(template, params, missing);
  } else if (_.isObject(template) && template.for && template.in && template.each) {
    let subs = _.at(params, template.in)[0];
    if (!subs) {
      missing.push(template.in);
      return;
    }
    return subs.map(param => splatParams(template.each.replace(`<${template.for}>`, param), params, missing));
  } else if (_.isObject(template) && template.if && template.then) {
    const conditional = _.at(params, template.if)[0];
    if (conditional === true) {
      // Only do this if the conditional exists and is literally true
      return expandExpressionTemplate(template.then, params, missing);
    } else if (conditional === undefined) {
      // In the case that the conditional is false, do nothing. If it is missing, we say so
      missing.push(template.if);
    } else if (conditional !== false) {
      throw new error(`conditional values must be booleans! ${template.if} is a ${typeof template.if}`);
    }
  } else {
    const key = Object.keys(template)[0];
    let subexpressions = [];
    template[key].forEach(scope => {
      const results = expandExpressionTemplate(scope, params, missing);
      if (results) {
        subexpressions = subexpressions.concat(results);
      }
    });
    return {[key]: subexpressions};
  }
};
