// Dependencies
var expect = require('chai').expect;
var nock = require('nock');
var fs = require('fs');
var path = require('path');
var api = require('../lib/api');

describe('api.js', function () {
	var credential = {};
	var accountList;

	//	start the real world testing if there is a credential file.
	if (fs.existsSync(__dirname + '/auth.json')) {

		this.timeout(20000);

		before(function () {
			//	Load test credential
			credential = require('./auth');
			//	Real world testing
			nock.enableNetConnect();
		});

		describe('- login()', function () {
			it('should login', function (done) {
				api.login(credential, function (error, accounts) {
					expect(error).to.be.null;
					expect(accounts).not.to.be.null;
					expect(accounts.length).to.be.above(0);
					accountList = accounts;

					done();
				});
			});
		});

		describe('- getTransactions()', function () {
			it('should retrieve transactions for given account', function (done) {
				this.timeout(600000);
				api.getTransactions(accountList[0], function (error, transactions) {
					expect(error).to.be.null;
					expect(transactions).not.to.be.null;
					expect(transactions.length).to.be.above(1000);

					done();
				});
			});
		});
	} else {
		// use nock to simulate the website
		var pages = {};
		var isLoggedIn = false;
		var credentialWrong = {};

		function load(filename) {
			return fs.readFileSync(
				path.resolve(path.resolve(__dirname, 'test_cases'), filename)
			).toString();
		}

		function loadPages() {
			//  login page
			pages.login = load('01-login-page.html');
			//  account list page
			pages.homePage = load('02-home-page.html');
			//  transactions page
			pages.transactionList = load('03-transaction-page.html');
			//  transactions page
			pages.transactionPartial = load('04-transaction-partial.txt');
			//  final empty transactions page
			pages.transactionEmpty = load('05-transaction-empty.txt');
			//	transaction json - case 1
			pages.transactionJson1 = load('transaction-1.json');
			//	transaction json - case 2
			pages.transactionJson2 = load('transaction-2.json');
			//	transaction json - case 3
			pages.transactionJson3 = load('transaction-3.json');

		}

		before(function () {
			//	load credential
			credential = {
				username: '76543210',
				password: 'YourPassword'
			};

			credentialWrong = {
				username: '23423423',
				password: 'WrongPassword'
			};

			loadPages();

			nock.disableNetConnect();
		});

		describe('- login()', function () {
			it('should login with correct credential', function (done) {
				//	prepare mock up
				var commbank = nock('https://www.my.commbank.com.au')
					//	Login page
					.get('/netbank/Logon/Logon.aspx')
					.reply(200, pages.login)
					//	submit login form with right credential
					.post('/netbank/Logon/Logon.aspx', function (body) {
						if (body.txtMyClientNumber$field === credential.username && body.txtMyPassword$field ===
							credential.password) {
							isLoggedIn = true;
							return true;
						} else {
							isLoggedIn = false;
						};
					})
					.reply(200, pages.homePage);

				//	test api
				api.login(credential, function (error, accounts) {
					expect(error).to.be.null;
					expect(accounts).not.to.be.null;
					expect(accounts.length).to.be.above(1);

					done();
					commbank.done();
					nock.cleanAll();
				});
			});

			it('should failed if credential is not working', function (done) {
				//	prepare mock up
				var commbank = nock('https://www.my.commbank.com.au')
					//	Login page
					.get('/netbank/Logon/Logon.aspx')
					.reply(200, pages.login)
					//	submit login form with wrong credential
					.post('/netbank/Logon/Logon.aspx', function (body) {
						return (body.txtMyClientNumber$field !== credential.username ||
							body.txtMyPassword$field !== credential.password);
					})
					.reply(200, pages.login);

				//	test api
				api.login(credentialWrong, function (error, accounts) {
					expect(error).not.to.be.null;
					done();
					commbank.done();
					nock.cleanAll();
				});
			});
		});

		describe('- getTransactions()', function () {
			var accountList = null;

			it('should retrieve transactions for given account', function (done) {
				//	prepare mock up
				var isLoggedIn = false;
				var commbank = nock('https://www.my.commbank.com.au')
					.filteringPath(/\?.*$/g, '')
					// .log(console.log)
					//	Login page
					.get('/netbank/Logon/Logon.aspx')
					.reply(200, pages.login)
					//	submit login form with right credential
					// .filteringPath(/\?.*$/g, '?bb')
					.post('/netbank/Logon/Logon.aspx', function (body) {
						if (body.txtMyClientNumber$field === credential.username && body.txtMyPassword$field ===
							credential.password) {
							isLoggedIn = true;
							return true;
						} else {
							// console.log(body);
							isLoggedIn = false;
							return false;
						};
					})
					.reply(200, pages.homePage)
					//	retrieve transaction page (logged in)
					.get('/netbank/TransactionHistory/History.aspx')
					.reply(200, pages.transactionList)
					//	Post to search transaction
					.post('/netbank/TransactionHistory/History.aspx', function (body) {
						return isLoggedIn;
					})
					.reply(200, pages.transactionList)
					//	get more transaction
					.post('/netbank/TransactionHistory/History.aspx', function (body) {
						return isLoggedIn;
					})
					.reply(200, pages.transactionPartial)
					//	get more transaction (but no more transactions)
					.post('/netbank/TransactionHistory/History.aspx', function (body) {
						return isLoggedIn;
					})
					.reply(200, pages.transactionEmpty);

				// api test
				api.login(credential, function (error, accounts) {
					expect(error).to.be.null;
					expect(accounts).not.to.be.null;
					expect(accounts.length).to.be.equal(4);

					//	store the accountList for next test
					accountList = accounts;

					api.getTransactions(accounts[0], function (error, transactions) {
						expect(error).to.be.null;
						expect(transactions).not.to.be.null;
						expect(transactions.length).to.equal(99);

						done();
						commbank.done();
						nock.cleanAll();
					});
				});
			});

			it('should failed if error happend during the transactions page parsing',
				function (done) {
					//	prepare mock up
					var isLoggedIn = false;
					var commbank = nock('https://www.my.commbank.com.au')
						.filteringPath(/\?.*$/g, '')
						// .log(console.log)
						//	Login page
						.get('/netbank/Logon/Logon.aspx')
						.reply(200, pages.login)
						//	submit login form with right credential
						// .filteringPath(/\?.*$/g, '?bb')
						.post('/netbank/Logon/Logon.aspx', function (body) {
							if (body.txtMyClientNumber$field === credential.username && body.txtMyPassword$field ===
								credential.password) {
								isLoggedIn = true;
							} else {
								isLoggedIn = false;
							}
							return isLoggedIn;
						})
						.reply(200, pages.homePage)
						//	submit login form with WRONG credential
						// .filteringPath(/\?.*$/g, '?bb')
						.post('/netbank/Logon/Logon.aspx', function (body) {
							if (body.txtMyClientNumber$field === credential.username && body.txtMyPassword$field ===
								credential.password) {
								isLoggedIn = true;
							} else {
								isLoggedIn = false;
							}
							return !isLoggedIn;
						})
						.reply(200, pages.login)
						//	retrieve transaction page (logged in)
						.get('/netbank/TransactionHistory/History.aspx')
						.reply(200, pages.login)
						//	Post to search transaction
						.post('/netbank/TransactionHistory/History.aspx', function (body) {
							return !isLoggedIn;
						})
						.reply(200, pages.login)
						//	get more transaction
						.post('/netbank/TransactionHistory/History.aspx', function (body) {
							return !isLoggedIn;
						})
						.reply(200, pages.login)
						//	get more transaction (but no more transactions)
						.post('/netbank/TransactionHistory/History.aspx', function (body) {
							return !isLoggedIn;
						})
						.reply(200, pages.login);

					// api test
					api.login(credentialWrong, function (error, accounts) {
						expect(isLoggedIn).to.be.false;

						expect(error).not.to.be.null;

						api.getTransactions(accountList[0], function (error, transactions) {
							expect(error).not.to.be.null;

							done();
							nock.cleanAll();
						});
					});

				});
		});
	}
});
