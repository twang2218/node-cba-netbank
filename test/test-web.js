// Dependencies
var expect = require('chai').expect;
var web = require('../lib/web');
var nock = require('nock');

describe('web.js', function () {
	//  create a simple parser to use
	function simpleParser(url, page, callback) {
		expect(page).to.equal('Hello from Google!');
		callback(null, url, page.split(' '));
	}

	//  create a simple callback to use
	function simpleCallback(error, url, words) {
		if (error) {
			throw error
		}
		expect(words).to.eql(['Hello', 'from', 'Google!']);
	}

	before(function () {
		nock.disableNetConnect();
	})

	describe('- get()', function () {
		it('should get a page, run parser, call back', function (done) {
			var commbank = nock('https://www.my.commbank.com.au')
				.get('/')
				.reply(200, 'Hello from Google!');

			web.get({
				url: 'https://www.my.commbank.com.au/'
			}, simpleParser, function (error, url, words) {
				simpleCallback(error, url, words);
				commbank.done();
				done();
			});
		});
		it('should raise error if request failed.', function (done) {
			var commbank = nock('https://www.my.commbank.com.au')
				.get('/')
				.replyWithError("something awful happened");

			web.get({
				url: 'https://www.my.commbank.com.au/'
			}, simpleParser, function (error, url, words) {
				expect(error).not.to.be.null;
				commbank.done();
				done();
			});
		});
	});

	describe('- post()', function () {
		it('should post a form, parse the page, and call back', function (done) {
			var commbank = nock('https://www.my.commbank.com.au')
				.post('/users', function (body) {
					expect(body.username).to.equal('johndoe');
					expect(body.password).to.equal('123456');

					return (body.username === 'johndoe' && body.password === '123456');
				}).reply(200, "Hello from Google!");

			web.post({
				url: 'https://www.my.commbank.com.au/users',
				form: {
					username: 'johndoe',
					password: '123456'
				}
			}, simpleParser, function (error, url, words) {
				simpleCallback(error, url, words);
				commbank.done();
				done();
			});
		});
		it('should raise error if request failed.', function (done) {
			var commbank = nock('https://www.my.commbank.com.au')
				.post('/users', function (body) {
					expect(body.username).to.equal('johndoe');
					expect(body.password).to.equal('123456');

					return (body.username === 'johndoe' && body.password === '123456');
				}).replyWithError("something awful happened");

			web.post({
				url: 'https://www.my.commbank.com.au/users',
				form: {
					username: 'johndoe',
					password: '123456'
				}
			}, simpleParser, function (error, url, words) {
				expect(error).not.to.be.null;
				commbank.done();
				done();
			});

		});
	});

	after(function () {
		nock.cleanAll();
	});
});
