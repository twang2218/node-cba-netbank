node-cba-netbank
================

[![NPM version][npm-version-image]][npm-url]
[![MIT License][license-image]][license-url]
[![Build Status][travis-image]][travis-url]
[![Dependency Status][dependency-image]][dependency-url]
[![Coverage Status][coverage-image]][coverage-url]

[![NPM][npm-classy-badge-image]][npm-classy-badge-url]

Unofficial The Commonwealth Bank of Australia NetBank API wrap for
Node.js

Install
-------

```bash
npm install node-cba-netbank --save
```

Usage
-----

### List Accounts

```js
var netbank = require('node-cba-netbank');

var credential = {
  username: '76543210',
  password: 'YourPassword'
};

netbank.login(credential, function (error, accounts) {
  if (error === null) {
    //  output account to console
    console.log(accounts);
  } else {
    console.error(error);
  }
});
```

Just replace `76543210` with your client number, and replace
`YourPassword` with your netbank password.

The result will look like below:

```js
[{
    nickname: 'Smart Access',
    url: '/netbank/TransactionHistory/History.aspx?ACCOUNT_PRODUCT_TYPE=DDA&DEEPLINKING_WITH_CONTEXT=True&_e=UGxheSB3aXRoIG1hZ2ljISAxCg%3d&RID=N4bdFut-vECN0pmnBx5aMA&SID=tGfirrUiubE%3d',
    bsbNumber: '06 2338',
    accountNumber: '5282 0634',
    number: '06233852820634',
    balance: 987.65,
    availableFunds: 907.65
}, {
    nickname: 'NetBank Saver',
    url: '/netbank/TransactionHistory/History.aspx?ACCOUNT_PRODUCT_TYPE=DDA&DEEPLINKING_WITH_CONTEXT=True&_e=UGxheSB3aXRoIG1hZ2ljISAyCg%3d%3d&RID=N4bdFut-vECN0pmnBx5aMA&SID=tGfirrUiubE%3d',
    bsbNumber: '06 2438',
    accountNumber: '5287 0642',
    number: '06243852870642',
    balance: 4321.01,
    availableFunds: 4021.00
},{
...
}]
```

For each account:

 * ```nickname```: Account name;
 * ```url```: Transaction page for the account, it will be different everytime you logged in;
 * ```bsbNumber```: BSB number;
 * ```accountNumber```: Account number (without BSB part);
 * ```number```: The entire account number, without space;
 * ```balance```: Current account balance. It might be different from the available funds;
 * ```availableFunds```: Current available funds of the account.

 ### Retrieve Transactions for Given Account

 ```js
 var netbank = require('node-cba-netbank');

 var credential = {
   username: '76543210',
   password: 'YourPassword'
 };

 // Login first
 netbank.login(credential, function (error, accounts) {
   if (error === null) {
     // Assume we are going to retrieve the transactions of the first account
     netbank.getTransactions(accounts[0], function (error, transactions) {
       if (error === null) {
         // output the transactions to console, be aware, it might be a lot.
         console.log(transactions);
       } else {
         console.error(error);
       }
     });
   } else {
     console.error(error);
   }
 });

 ```

 **Be aware, it might take several minutes if there are thousands transactions.**

 The transaction list will look like below:

 ```js
 [ { timestamp: 1429488000004,
    date: '2015-04-20T00:00:00.004Z',
    description: 'SO THAI RESTAURANT       KOGARAH',
    amount: -13.9,
    balance: 0,
    trancode: '00 05',
    receiptnumber: '' },
  { timestamp: 1429488000003,
    date: '2015-04-20T00:00:00.003Z',
    description: 'NOK NOK                  SYDNEY',
    amount: -41.8,
    balance: 0,
    trancode: '00 05',
    receiptnumber: '' },
    ...
  ]
 ```

For each transaction:

* ```timestamp```: Timestamp of given transaction, it's milliseconds since epoch. Although, it might be pretty accurate for some accounts (non-credit card account), it might just be accurate at date level;
* ```date```: It's human readable date format;
* ```description```: Transaction description;
* ```amount```: Transaction amount, negative value is DR, positive value is CR;
* ```balance```: The balance of the account after the transaction happened, however, the field might be empty for some accounts, such as credit card account;
* ```trancode```: It's a category code for the transaction, such as ATM, EFTPOS, cash out might be different code;
* ```receiptnumber```: The receipt number for the transaction. However, I cannot found it on my real paper receipt, and the field might be missing for some accounts, such as credit card account;


Testing
-------

To enable real world testing, please put a JSON file, ```auth.json``` under ```./test/``` directory, and put content of real credential information in it:

```js
{
  "username": "76543210",
  "password": "YourPassword"
}
```

Then run command:

```bash
npm test
```

The test will try to login and get transactions from the first account, and if it will fail if the retrieved transactions number is less than 1000. It's ok if you don't have that much transactions in the account. The purpose of checking whether it get more than 1000 transactions is to check whether it can overcome the maximum transactions limits.


[license-image]: http://img.shields.io/badge/license-Apache%202.0-blue.svg?style=flat
[license-url]: LICENSE.txt

[npm-url]: https://npmjs.org/package/node-cba-netbank
[npm-version-image]: http://img.shields.io/npm/v/node-cba-netbank.svg?style=flat
[npm-downloads-image]: http://img.shields.io/npm/dm/node-cba-netbank.svg?style=flat
[npm-classy-badge-image]: https://nodei.co/npm/node-cba-netbank.png?downloads=true&downloadRank=true&stars=true
[npm-classy-badge-url]: https://nodei.co/npm/node-cba-netbank/

[travis-url]: http://travis-ci.org/twang2218/node-cba-netbank
[travis-image]: http://img.shields.io/travis/twang2218/node-cba-netbank/develop.svg?style=flat

[dependency-url]: https://gemnasium.com/twang2218/node-cba-netbank
[dependency-image]: http://img.shields.io/gemnasium/twang2218/node-cba-netbank.svg

[coverage-url]: https://coveralls.io/r/twang2218/node-cba-netbank
[coverage-image]: http://img.shields.io/coveralls/twang2218/node-cba-netbank.svg
