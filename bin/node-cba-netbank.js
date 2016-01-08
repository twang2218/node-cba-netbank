#!/usr/bin/env node

// Dependencies
var inquirer = require('inquirer');
var netbank = require('../lib');

var questionUsername = {
	type: 'input',
	name: 'username',
	message: 'What\'s your client number:',
	validate: function (input) {
		return (/^\d{1,8}$/).test(input);
	}
};

var questionPassword = {
	type: 'password',
	name: 'password',
	message: 'What\'s your password:',
	validate: function (input) {
		return (/^[\w\d\-]{4,16}$/).test(input);
	}
};

var questionTryAgain = {
	type: 'confirm',
	name: 'tryagain',
	message: 'Failed to logged in, try again?'
};

function getAccountTitle(account) {
	var title = account.nickname + ' (' + account.bsbNumber + ' ' + account.number +
		') ' + '\t=>\t$' + account.balance;
	return title;
}

function getTransactionTitle(transaction) {
	var title = transaction.date + ': ' + transaction.description + '\t$' +
		transaction.amount;
	return title;
}

function login() {
	//  user input credential
	inquirer.prompt([questionUsername, questionPassword], function (answer) {
		//  login
		netbank.login(answer, function (err, accounts) {
			if (err === null && accounts.length > 0) {
				var questionSelectAccount = {
					type: 'list',
					name: 'account',
					message: 'Which account you want to download the transactions history?',
					choices: []
				};

				for (var index in accounts) {
					var account = accounts[index];
					questionSelectAccount.choices.push(getAccountTitle(account));
				}
				questionSelectAccount.choices.push('<Quit>');

				//  user select an account to download transaction, or quit.
				inquirer.prompt(questionSelectAccount, function (answer) {
					for (var index in accounts) {
						var account = accounts[index];
						if (answer.account === getAccountTitle(account)) {
							//  download transactions
							console.log('Downloading transactions history ...');
							netbank.getTransactions(account, function (err, transactions) {
								if (err === null && transactions.length > 0) {
									console.log('Retrieved ' + transactions.length +
										' transactions.');

									var questionTransactions = {
										type: 'list',
										name: 'account',
										message: 'This is the retrieved transactions:',
										choices: []
									};

									for (var index in transactions) {
										var transaction = transactions[index];
										questionTransactions.choices.push(getTransactionTitle(
											transaction));
									}

									inquirer.prompt(questionTransactions, function (answer) {
										//  bye
										console.log('bye');
									});
								} else {
									console.error(err);
								}
							});
						}
					}
				});
			} else {
				inquirer.prompt(questionTryAgain, function (answer) {
					if (answer.tryagain) {
						console.log();
						login();
					}
				});
			}
		});
	});
}

login();
