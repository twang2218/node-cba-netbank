// Dependencies
var moment = require('moment');
var string = require('string');
var web = require('./web');
var parser = require('./parser');
var Set = require('collections/fast-set');

// Constant
var LINK = {
	LOGIN: '/netbank/Logon/Logon.aspx',
	TRANSACTION: '/netbank/TransactionHistory/History.aspx?RID=:RID&SID=:SID',
	EXPORT: '/netbank/TransactionHistory/Exports.aspx?RID=:RID&SID=:SID&ExportType=OFX'
};

// Constructor
var API = module.exports = {};

API.login = function (confidential, callback) {
	web.get({
		url: LINK.LOGIN
	}, parser.parseForm, function (error, form) {
		if (error !== null) {
			callback(error);
			return;
		}

		//	fill the login form
		form.txtMyClientNumber$field = confidential.username;
		form.txtMyPassword$field = confidential.password;
		form.chkRemember$field = 'on';
		//  make JS detector happy
		form.JS = 'E';

		web.post({
				url: LINK.LOGIN,
				form: form
			},
			parser.parseHomePage,
			function (error, form, accounts) {
				if (error !== null) {
					callback(error);
					return;
				}

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
			url: account.url,
			form: form,
			partial: true
		},
		parser.parseTransactions,
		function (error, transactions) {
			if (error === null) {
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

	// send the request
	web.post({
			url: account.url,
			form: form,
			partial: true
		},
		parser.parseTransactions,
		function (error, transactions) {
			if (error === null) {
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
								function (error, moreAgain) {
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

API.getTransactions = function (account, callback) {
	//	retrieve post form and key for the given account
	web.get({
			url: account.url
		},
		parser.parseTransactionPage,
		function (error, form, transactions, keys) {
			if (error !== null) {
				callback(error);
				return;
			}

			// Attach the account key value for searching
			account.key = keys.filter(function (value) {
				return value.number === account.number;
			})[0].key;

			//	Download range from now to 5 years ago, as normally bank doesn't
			//	keep transactions log for too long. FYI, tried 8 years without error
			//	message in the first place, however, bank only stored 2 years transactions
			//	data.
			var from = toDateString(moment.utc().subtract(5, 'years').valueOf());
			var to = toDateString(moment.utc().valueOf());

			API.getTransactionsByDate(form, account, from, to,
				function (error, transactions) {
					callback(error, transactions);
				});

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
