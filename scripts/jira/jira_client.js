var $ = require('jquery');
var Q = require('q');
var _ = require('lodash');
var RapidView = require('./rapid_view');

function JiraClient(domain) {
  if (!domain) {
    throw "Expected domain to be specified.";
  }
  
  this._domain = domain;

  _.bindAll(this);
}

JiraClient.prototype.getDomain = function() {
  return this._domain;
}

JiraClient.prototype.getResource = function(resourceType) {
  var deferred = Q.defer();
  $.ajax({
		type: 'GET',
		url: this._domain + "/rest/api/2/" + resourceType + "/",
		contentType: "application/json",
		error: function() {
			deferred.reject();
		},
		success: function(items) {
			deferred.resolve(items);
		}
	});
	return deferred.promise;  
}

JiraClient.prototype.getResourceByName = function(resourceType, resourceName) {
  var deferred = Q.defer();
  this.getResource(resourceType).then(function(resources) {
    var resource = _.find(resources, function(resource) {
      return resource.name == resourceName;
    });
    if (resource) {
      deferred.resolve(resource);
    } else {
      deferred.reject();
    }
  });
  return deferred.promise;
}

JiraClient.prototype.search = function(opts) {
  var queryString = "maxResults=9999";
  if (typeof opts == "object") {
    queryString += "&jql=" + opts.query;
    if (opts.expand) {
      queryString += "&expand=" + opts.expand.join();
    }
  } else {
    queryString += "&jql=" + opts;
  }
  var deferred = Q.defer();
  $.ajax({
		type: 'GET',
		url: this._domain + "/rest/api/2/search/?" + queryString,
		contentType: "application/json",
		error: function() {
			deferred.reject();
		},
		success: function(results) {
			deferred.resolve(results.issues);
		}
	});
	return deferred.promise;
}

JiraClient.prototype.getRapidViews = function() {
  var self = this;
  var deferred = Q.defer();
  $.ajax({
		type: 'GET',
		url: this._domain + "/rest/greenhopper/1.0/rapidviews/list",
		contentType: "application/json",
		error: function() {
			deferred.reject();
		},
		success: function(results) {
			deferred.resolve(
			  _(results.views).map(function(view) {
			    return new RapidView(self, view);
			  }));
		}
	});
	return deferred.promise;
}

JiraClient.prototype.getRapidViewById = function(rapidViewId) {
  return this.getRapidViews().then(function(views) {
    return _(views).find(function(view) {
      return view.id == rapidViewId;
    });
  });
}

JiraClient.prototype.getEpicLinkFieldId = function () {
  if (!this._promiseForEpicLinkFieldId) {
    this._promiseForEpicLinkFieldId = this.getResourceByName('field', 'Epic Link')
      .then(function(field) {
        return field.schema.customId;
      });
  }
  return this._promiseForEpicLinkFieldId;
}

module.exports = JiraClient;