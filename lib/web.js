// Dependencies
var request = require('request');
var url = require('url');

// Constructor
var web = module.exports = {};

// Initialisation
request = request.defaults({
	jar: true,
	headers: {
		'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_10_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/41.0.2227.1 Safari/537.36'
	},
	followAllRedirects: true
});

function parseParams(method, params) {
	var p = {};
	p.url = params.url;
	p.form = params.form;
	if (params.redirect !== false) {
		p.followAllRedirects = true;
	}
	if (params.partial === true) {
		p.headers = {
			'X-MicrosoftAjax': 'Delta=true'
		};
	}
	p.method = method;
	return p;
}

// params:
// {
// 	url,
// 	form,
// 	redirect, //	default: true
// 	partial   //	default: false
// }

function req(params, parser, callback) {
	//console.log(params.method + ': ' + params.url);
	request(params, function (error, response, body) {
		if (!error && response.statusCode === 200) {
			// var link = url.parse(UrlBase);
			// //	redirected to another server, so update 'UrlBase' to the new one
			// if (link.hostname !== response.request.host) {
			// 	link.host = response.request.host;
			// 	UrlBase = url.format(link);
			// }
			// //	redirected to another path or with another params
			// console.log(response.request.href);
			parser(response.request.href, body, callback);
		} else {
			callback(error);
		}
	});
}

web.get = function (params, parser, callback) {
	var p = parseParams('GET', params);
	req(p, parser, callback);
};

web.post = function (params, parser, callback) {
	var p = parseParams('POST', params);
	req(p, parser, callback);
};
