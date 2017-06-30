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
const netbank = require('node-cba-netbank');

netbank.login({ username: '76543210', password: 'YOUR_PASSWORD' })
  .then(resp => {
    //  output account to console
    resp.accounts.forEach(a => console.log(`${a.name} (${a.bsb} ${a.account}) => ${a.balance}/${a.available}`));
  })
  .catch(console.error);
```

Just replace `76543210` with your client number, and replace
`YOUR_PASSWORD` with your netbank password.

The result will look like below:

```js
Smart Access (062001 12340001) => 987.65/907.65
NetBank Saver (062002 12340012) => 4321.01/4021.00
...
```

For each account, there are following properties:

 * `name`: Account name;
 * `url`: Transaction page for the account, it will be different everytime you logged in;
 * `bsb`: BSB number;
 * `account`: Account number (without BSB part);
 * `number`: The entire account number, `bsb`+`account`, without space;
 * `balance`: Current account balance. It might be different from the available funds;
 * `available`: Current available funds of the account.

 ### Retrieve Transactions for Given Account

```js
 const netbank = require('node-cba-netbank');

netbank.login({ username: '76543210', password: 'YOUR_PASSWORD' })
  // Assume we are going to retrieve the transactions of the first account
  .then(resp => netbank.getTransactions(resp.accounts[0]))
  .then((resp) => {
    //  output transactions to console
    resp.transactions.forEach(t => console.log(`${t.date} ${t.description} => ${t.amount}`));
  })
  .catch(console.error);
```

 **Be aware, it might take several minutes if there are thousands transactions.**

 The transaction list will look like below:

```
2015-04-20T00:00:00.004Z SO THAI RESTAURANT       KOGARAH => -13.9
2015-04-20T00:00:00.003Z NOK NOK                  SYDNEY => -41.8
...
```

For each transaction object, there are following properties:

* ```timestamp```: Timestamp of given transaction, it's milliseconds since epoch. Although, it might be pretty accurate for some accounts (non-credit card account), it might just be accurate at date level;
* ```date```: It's human readable date format;
* ```description```: Transaction description;
* ```amount```: Transaction amount, negative value is DR, positive value is CR;
* ```balance```: The balance of the account after the transaction happened, however, the field might be empty for some accounts, such as credit card account;
* ```trancode```: It's a category code for the transaction, such as ATM, EFTPOS, cash out might be different code;
* ```receiptnumber```: The receipt number for the transaction. However, I cannot found it on my real paper receipt, and the field might be missing for some accounts, such as credit card account;

Testing
-------

Offline test can be done by simply run `yarn test`.

To enable real world testing, please put a JSON file, `auth.json` under `./test/` directory, and put content of real credential information in it:

```js
{
  "username": "76543210",
  "password": "YOUR_PASSWORD"
}
```

Then run command:

```bash
yarn test
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
[travis-image]: http://img.shields.io/travis/twang2218/node-cba-netbank.svg?style=flat

[dependency-url]: https://gemnasium.com/twang2218/node-cba-netbank
[dependency-image]: http://img.shields.io/gemnasium/twang2218/node-cba-netbank.svg

[coverage-url]: https://coveralls.io/r/twang2218/node-cba-netbank
[coverage-image]: http://img.shields.io/coveralls/twang2218/node-cba-netbank.svg
