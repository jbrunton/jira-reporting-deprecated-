var _ = require('lodash');
var moment = require('moment');
var Q = require('q');

function Issue(jiraClient, issue) {
  this._jiraClient = jiraClient;
  _.assign(this, issue);
  _.bindAll(this);
}

Issue.prototype.analyze = function() {

  // TODO: refactor this function and cache the promise

  function isStatusTransition(item) {
    return item.field == "status";
  }

  function getIssueStartedDate(issue) {
    var startedTransitions = _(issue.changelog.histories)
      .filter(function(entry) {
        return _(entry.items).any(function(item) {
          return isStatusTransition(item) && item.toString == "In Progress";
        });
      });

    if (startedTransitions.any()) {
      return moment(startedTransitions.first().created);
    } else {
      return null;
    }
  }

  function getIssueCompletedDate(issue) {
    var lastTransition = _(issue.changelog.histories)
      .filter(function(entry) {
        return _(entry.items)
          .any(isStatusTransition);
      }).last();

    if (lastTransition && _(lastTransition.items)
      .find(isStatusTransition).toString == "Done") {
      return moment(lastTransition.created);
    } else {
      return null;
    }
  }

  this.startedDate = getIssueStartedDate(this);
  this.completedDate = getIssueCompletedDate(this);

  return Q(this);
}

module.exports = Issue;