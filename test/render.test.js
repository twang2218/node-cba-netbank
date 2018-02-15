/* eslint-disable no-undef */
const render = require('../src/render.js');
//  as it's not easy to test the chalk style result across platform, so the style will not be tested.
const stripAnsi = require('strip-ansi');

describe('render.js', () => {
  it('should parse currency', () => {
    expect(stripAnsi(render.currency(1))).toEqual('$1.00');
    expect(stripAnsi(render.currency(-1))).toEqual('$-1.00');
    expect(stripAnsi(render.currency(0.01))).toEqual('$0.01');
    expect(stripAnsi(render.currency(0.333))).toEqual('$0.33');
  });
  it('should parse account', () => {
    const account = {
      name: 'Smart Access',
      bsb: '2012',
      account: '12345678',
      number: '201212345678',
      balance: 1234.56,
      available: 1034.56,
    };
    expect(stripAnsi(render.account(account))).toEqual('Smart Access \t(2012 12345678)\t Balance: $1234.56 \t Available Funds: $1034.56');
  });
  it('should parse account list into table', () => {
    const accounts = [
      {
        name: 'Smart Access',
        bsb: '2012',
        account: '12345678',
        number: '201212345678',
        balance: 1234.56,
        available: 1034.56,
      },
      {
        name: 'Goal Saver',
        bsb: '2013',
        account: '76543210',
        number: '201376543210',
        balance: 2345.78,
        available: 2345.56,
      },
    ];

    expect(stripAnsi(render.accounts(accounts))).toEqual('Name          Number         Balance   Available\n' +
        '------------  -------------  --------  ---------\n' +
        'Smart Access  2012 12345678  $1234.56  $1034.56 \n' +
        'Goal Saver    2013 76543210  $2345.78  $2345.56 \n');
  });
  it('should parse transaction list into table', () => {
    const transactions = [
      {
        timestamp: 1499087295615,
        pending: true,
        description: 'PENDING - YUMCHA',
        amount: 123,
        balance: 1234.12,
      },
      {
        timestamp: 1499004731767,
        description: 'CAFE',
        amount: 12.3,
        balance: 1234.12,
      },
    ];
    expect(stripAnsi(render.transactions(transactions))).toEqual('Time              Description       Amount   Balance \n' +
        '----------------  ----------------  -------  --------\n' +
        '2017-07-03 23:08  PENDING - YUMCHA  $123.00          \n' +
        '2017-07-03 00:12  CAFE              $12.30   $1234.12\n');
  });
});
