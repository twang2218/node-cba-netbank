// Dependencies
var moment = require('moment');
var string = require('string');
var web = require('./web');
var parser = require('./parser');
var Set = require('collections/fast-set');
var Url = require('url');

// Constant
var LINK = {
	BASE: 'https://www.my.commbank.com.au',
	LOGIN: '/netbank/Logon/Logon.aspx',
	TRANSACTION: '/netbank/TransactionHistory/History.aspx?RID=:RID&SID=:SID',
	EXPORT: '/netbank/TransactionHistory/Exports.aspx?RID=:RID&SID=:SID&ExportType=OFX'
};

// Constructor
var API = module.exports = {};

function getUrl(path) {
	return Url.resolve(LINK.BASE, path);
}

function refreshBase(url) {
	var oldLink = Url.parse(LINK.BASE);
	var newLink = Url.parse(url);

	if (oldLink.host !== newLink.host) {
		oldLink.host = newLink.host;
		LINK.BASE = Url.format(oldLink);
	}
}

API.login = function (confidential, callback) {
	web.get({
		url: getUrl(LINK.LOGIN)
	}, parser.parseForm, function (error, url, form) {
		if (error !== null) {
			callback(error);
			return;
		}

		refreshBase(url);

		//	fill the login form
		form.txtMyClientNumber$field = confidential.username;
		form.txtMyPassword$field = confidential.password;
		form.chkRemember$field = 'on';
		//  make JS detector happy
		form.JS = 'E';

		web.post({
				url: getUrl(LINK.LOGIN),
				form: form
			},
			parser.parseHomePage,
			function (error, url, form, accounts) {
				if (error !== null) {
					callback(error);
					return;
				}

				refreshBase(url);

				callback(null, accounts);
			});
	});
};

API.getMoreTransactions = function (form, account, callback) {
	// console.log(' => getMoreTransactions()');

	// fill the form
	form.ctl00$ctl00 =
		'ctl00$BodyPlaceHolder$UpdatePanelForAjax|ctl00$BodyPlaceHolder$UpdatePanelForAjax';
	form.__EVENTTARGET = 'ctl00$BodyPlaceHolder$UpdatePanelForAjax';
	form.__EVENTARGUMENT =
		'doPostBackApiCall|LoadTransactions|{"ClearCache":"false","IsSorted":false,"IsAdvancedSearch":true,"IsMonthSearch":false}';

	// send the request
	web.post({
			url: getUrl(account.url),
			form: form,
			partial: true
		},
		parser.parseTransactions,
		function (error, url, transactions) {
			if (error === null) {

				refreshBase(url);
				account.url = Url.parse(url).path;

				if (transactions.length > 0) {
					API.getMoreTransactions(form, account, function (error, more) {
						if (error === null) {
							if (more.length > 0) {
								//	add more transactions to previous batch.
								addAll(transactions, more);
							}
							callback(null, transactions);
						} else {
							callback(error, transactions);
						}
					});
				} else {
					callback(null, transactions);
				}
			} else {
				callback(error);
			}
		});
};

API.getTransactionsByDate = function (form, account, from, to, callback) {
	// console.log(' => getTransactionsByDate(' + from + ' => ' + to + ')');
	//	fill the form
	form.ctl00$ctl00 =
		'ctl00$BodyPlaceHolder$updatePanelSearch|ctl00$BodyPlaceHolder$lbSearch';
	form.__EVENTTARGET = 'ctl00$BodyPlaceHolder$lbSearch';
	form.__EVENTARGUMENT = '';
	form.ctl00$BodyPlaceHolder$searchTypeField = '1';
	form.ctl00$BodyPlaceHolder$radioSwitchDateRange$field$ = 'ChooseDates';
	form.ctl00$BodyPlaceHolder$dateRangeField = 'ChooseDates';
	form.ctl00$BodyPlaceHolder$fromCalTxtBox$field = from;
	form.ctl00$BodyPlaceHolder$toCalTxtBox$field = to;

	//  Add this for partial update
	form.ctl00$BodyPlaceHolder$radioSwitchSearchType$field$ = 'AllTransactions';

	// send the request
	web.post({
			url: getUrl(account.url),
			form: form,
			partial: true
		},
		parser.parseTransactions,
		function (error, url, transactions) {
			if (error === null) {

				refreshBase(url);
				account.url = Url.parse(url).path;

				if (transactions.length > 0) {
					API.getMoreTransactions(form, account, function (error, more) {
						if (error === null) {
							if (more.length > 0) {
								//	add more transactions to previous batch.
								addAll(transactions, more);
							}
							callback(null, transactions);
						} else {
							//	an error happend during load more, mean it should have more,
							//	however, some restriction made it stopped, so we call it again,
							//	but this time, we use the eariliest date from the transactions
							//	we retrieved so far as the toDate, so it might workaround this
							//	problem.

							// console.warn(error);

							//	create the new to date
							var timestamp = transactions[0].timestamp;
							for (var index in transactions) {
								var t1 = transactions[index].timestamp;
								if (timestamp > t1) {
									timestamp = t1;
								}
							}

							// Call self again
							API.getTransactionsByDate(form, account,
								from, toDateString(timestamp),
								function (error, url, moreAgain) {
									if (error === null) {
										if (moreAgain.length > 0) {
											//	add more transactions to previous batch;
											addAll(transactions, moreAgain);
										}
										callback(null, transactions);
									} else {
										//	cannot call it again, but we got some transactions at least,
										//	so, just call it a success.
										console.warn('WARN: failed to call self again to load more');
										callback(null, transactions);
									}
								});
						}
					});
				} else {
					callback(null, transactions);
				}
			} else {
				callback(error);
			}
		});
};

//	If the search panel is lazy loading, not only the transactions data is not in
//	the page, the search page widget is not ready as well. So, search request will
//	fail. To workaround such problem, we send an update panel partial callback
//	first,let server side prepared the search panel and download transaction.
//	Then, do the real search using the information from the parital callback result.
function lazyLoadingTransaction(form, account, callback) {
	//	Send partial request
	form.ctl00$ctl00 =
		'ctl00$BodyPlaceHolder$UpdatePanelForAjax|ctl00$BodyPlaceHolder$UpdatePanelForAjaxh';
	form.__EVENTTARGET = 'ctl00$BodyPlaceHolder$UpdatePanelForAjax';
	form.__EVENTARGUMENT = 'doPostBackApiCall|LoadRecentTransactions|false';

	web.post({
			url: getUrl(account.url),
			form: form,
			partial: true
		},
		parser.parseFormInPartialUpdate,
		function (error, url, formPartial) {
			if (error === null && formPartial !== null) {
				for (var index in formPartial) {
					form[index] = formPartial[index];
				}
				callback(null, form);
			} else {
				callback(error);
			}
		});
}

API.getTransactions = function (account, callback) {
	//	retrieve post form and key for the given account
	web.get({
			url: getUrl(account.url)
		},
		parser.parseTransactionPage,
		function (error, url, form, transactions, keys) {
			if (error !== null && form === null) {
				callback(error);
				return;
			}

			refreshBase(url);
			account.url = Url.parse(url).path;

			if (keys !== null) {
				// Attach the account key value for searching
				account.key = keys.filter(function (value) {
					return value.number === account.number;
				})[0].key;
			}

			//	Download range from now to 5 years ago, as normally bank doesn't
			//	keep transactions log for too long. FYI, tried 8 years without error
			//	message in the first place, however, bank only stored 2 years transactions
			//	data.
			var from = toDateString(moment.utc().subtract(5, 'years').valueOf());
			var to = toDateString(moment.utc().valueOf());

			//	if the transaction section is lazy loading, we need do a panel update
			//	first, before the real search.
			if (typeof form.ctl00$BodyPlaceHolder$radioSwitchSearchType$field$ ===
				'undefined') {
				lazyLoadingTransaction(form, account, function (error, form) {
					if (error === null) {
						API.getTransactionsByDate(form, account, from, to,
							function (error, transactions) {
								callback(error, transactions);
							});
					} else {
						callback(error);
					}
				});
			} else {
				API.getTransactionsByDate(form, account, from, to,
					function (error, transactions) {
						callback(error, transactions);
					});
			}
		});
};

//	Utilities
function toDateString(timestamp) {
	return moment(timestamp).utc().format('DD/MM/YYYY');
}

//	Find whether those 2 transactions are exactly match.
function equal(left, right) {
	if (
		//	case 1. Have same receipt number, of course, it's not empty
		(!string(left.receiptnumber).isEmpty() && left.receiptnumber === right.receiptnumber)
		//	case 2. Same time, same description and same amount
		|| (left.timestamp === right.timestamp && left.description === right.description &&
			left.amount === right.amount)
	) {
		return true;
	} else {
		return false;
	}
}

function hash(transaction) {
	return transaction.timestamp.toString();
}

function addAll(base, more) {
	var set = new Set(base, equal, hash);

	for (var im in more) {
		var m = more[im];
		if (!set.has(m)) {
			base.push(m);
			set.add(m);
		}
	}
}
