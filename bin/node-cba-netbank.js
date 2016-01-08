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

var accounts = [];

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

function credentialHandler(answer) {
	//  login
	netbank.login(answer, function (err, accountList) {
		if (err === null && accountList.length > 0) {
			accounts = accountList;
			var questionSelectAccount = {
				type: 'list',
				name: 'account',
				message: 'Which account?',
				choices: []
			};

			for (var index in accounts) {
				var account = accounts[index];
				questionSelectAccount.choices.push(getAccountTitle(account));
			}
			questionSelectAccount.choices.push('<Quit>');

			//  user select an account to download transaction, or quit.
			inquirer.prompt(questionSelectAccount, accountSelectedHandler);
		} else {
			inquirer.prompt(questionTryAgain, function (answer) {
				if (answer.tryagain) {
					console.log();
					main();
				}
			});
		}
	});
}

function accountSelectedHandler(answer) {
	for (var index in accounts) {
		var account = accounts[index];
		if (answer.account === getAccountTitle(account)) {
			//  download transactions
			console.log('Downloading transactions history ...');
			netbank.getTransactions(account, transactionReceivedHandler);
		}
	}
}

function transactionReceivedHandler(err, transactions) {
	if (err === null && transactions.length > 0) {
		console.log('Retrieved ' + transactions.length +
			' transactions.');

		var questionTransactions = {
			type: 'list',
			name: 'account',
			message: 'Transactions:',
			choices: []
		};

		for (var index in transactions) {
			var transaction = transactions[index];
			questionTransactions.choices.push(getTransactionTitle(
				transaction));
		}

		inquirer.prompt(questionTransactions, quit);
	} else {
		console.error(err);
	}
}

function quit() {
	//  bye
	console.log('bye');
}

function main() {
	//  user input credential
	inquirer.prompt([questionUsername, questionPassword], credentialHandler);
}

main();
