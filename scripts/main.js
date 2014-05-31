var JiraClient = require('./jira_client');
var $ = require('jquery');
var _ = require('lodash');
var Q = require('q');
var Handlebars = require("hbsfy/runtime");
var moment = require('moment');

$(function() {
  var jiraClient = new JiraClient(window.location.origin);
  
  function getSprintFieldId() {
    return jiraClient.getResourceByName('field', 'Sprint')
      .then(function(field) {
        return field.id;
      });
  }
  
  function getEpicFieldId() {
    return jiraClient.getResourceByName('field', 'Epic Link')
      .then(function(field) {
        return field.id;
      });
  }
  
  function getCurrentRapidView() {
    var rapidViewId = /rapidView=(\d*)/.exec(window.location.href)[1];
    return jiraClient.getRapidViews().then(function(views) {
      return _(views).find(function(view) {
        return view.id == rapidViewId;
      });
    });
  }
  
  // function getCurrentRapidViewIssues() {
  //   return getCurrentRapidView().then(function(view) {
  //     return jiraClient.search(view.filter.query);
  //   });
  // }
  
  function getCurrentRapidViewEpics() {
    return getCurrentRapidView().then(function(view) {
      return jiraClient.search("issuetype=Epic AND " + view.filter.query);
    });
  }
  
  function isEpic(issue) {
    return issue.fields.issuetype.name == 'Epic';
  }
  
  function getProjectEpics() {
    return getCurrentRapidViewEpics();
    // return getCurrentRapidViewIssues()
    //   .then(function(issues) {
    //     return _(issues).filter(isEpic);
    //   });
  }
  
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
  
  function getEpicStartedDate(epic) {
    var issueStartedDates = _(epic.issues)
      .map(function(issue) {
        return issue.startedDate;
      })
      .compact();
    
    if (issueStartedDates.any()) {
      var startedDate = issueStartedDates
        .min(function(date) {
          return date.unix();
        })
        .value();
      
      return startedDate;
    } else {
      return null
    }
  }
  
  function getEpicCompletedDate(epic) {
    var issueCompletedDates = _(epic.issues)
      .map(function(issue) {
        return issue.completedDate;
      });
      
    if (issueCompletedDates.all()) {
      var completedDate = issueCompletedDates
        .max(function(date) {
          return date.unix();
        })
        .value();
      
      return completedDate;
    } else {
      return null;
    }
  }
  
  function getIssuesForEpic(epicKey) {
    return jiraClient.search({
      query: "cf[10800]=" + epicKey,
      expand: ['changelog']
    }).then(function(issues) {
      var issues = _(issues).map(function(issue) {
        issue.startedDate = getIssueStartedDate(issue);
        issue.completedDate = getIssueCompletedDate(issue);
        return issue;
      }).value();
      return issues;
    });
  }
  
  function expandEpic(epic) {
    return getIssuesForEpic(epic.key)
      .then(function(issues) {
        epic.issues = issues;
        epic.startedDate = getEpicStartedDate(epic);
        epic.completedDate = getEpicCompletedDate(epic);
        return epic;
      })
  }
  
  function generateReportData() {
    // return getProjectEpics()
    //   .then(function (epics) {
    //     return Q.all(
    //       _(epics).map(function(epic) {
    //         return expandEpic(epic);
    //       }).value()
    //     );
    //   }).then(function(epics) {
    //     return {
    //       epics: epics
    //     };
    //   });
    
    return getProjectEpics().then(function(epics) {
      return {
        epics: epics
      };
    })
  }
  
  function renderReport() {
    
    _(['message', 'intro', 'header', 'content'])
      .each(function(divName) {
        $('#ghx-chart-' + divName).empty();
      });
    
    Handlebars.registerHelper('issue_link', function() {
      var escapedKey = Handlebars.Utils.escapeExpression(this.key);
      return new Handlebars.SafeString("<a href='/browse/" + escapedKey + "'>" + escapedKey + "</a>");
    });
    Handlebars.registerHelper('date', function(date) {
      if (date) {
        var dateString = Handlebars.Utils.escapeExpression(date.format('MMMM Do YYYY, h:mm:ss a'));
        return new Handlebars.SafeString(dateString);
      }
    });
    Handlebars.registerHelper('cycle_time', function() {
      if (this.startedDate && this.completedDate) {
        var diffString = Handlebars.Utils.escapeExpression(this.startedDate.from(this.completedDate, true));
        return new Handlebars.SafeString(diffString);
      }
    });

    var reportTemplate = require("./templates/report.hbs");
    
    generateReportData()
      .then(function(reportData) {
        $('#ghx-chart-content')
          .append(reportTemplate(reportData));
      });
  }

  $("#ghx-chart-nav").on('DOMNodeInserted', layoutMenu);
      
  function layoutMenu() {
    
    function jiraReportingClicked() {
      var selectedClass = 'aui-nav-selected';
      var menuItemSelector = '#ghx-chart-nav li';
      $(menuItemSelector).removeClass(selectedClass);
      $(this).closest(menuItemSelector).addClass(selectedClass);
      renderReport();
    }
    
    var jiraReportingLink = $('#jira-reporting-link');
    if (!jiraReportingLink.size()) {
      $("<li id='jira-reporting-link' data-tooltip='Foo' original-title=''><a href='#'>Jira Reporting</a></li>")
        .click(jiraReportingClicked)
        .appendTo('#ghx-chart-nav');
    } else {
      jiraReportingLink
        .appendTo('#ghx-chart-nav');
    }
  }  
  
  layoutMenu();
  
  // Q.all([
  //   getSprintFieldId(),
  //   getCurrentRapidViewIssues()
  // ]).spread(function(sprintFieldId, issues) {
  //   console.log('sprintField: ' + sprintField);
  //   console.log('issues: ' + issues);
  // });
});

  