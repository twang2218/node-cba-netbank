const ofxSerializer = require('ofx');

// Dependencies
const moment = require('./moment');

//  Functions
const csvAmount = n => (n > 0 ? `+${n.toFixed(2)}` : `${n.toFixed(2)}`);

const csvTransaction = t =>
  `${moment(t.timestamp).format(moment.formats.default)}` +
  `,"${csvAmount(t.amount)}"` +
  `,"${t.description}"` +
  `,"${csvAmount(t.balance)}"\r\n`;

const qifTransaction = (transaction, type = 'default') => {
  let format;
  switch (type) {
    case 'aus':
      format = moment.formats.aus;
      break;
    case 'us':
      format = moment.formats.us;
      break;
    default:
      format = moment.formats.default;
      break;
  }
  const lline = type === 'default' ? `L${transaction.amount >= 0 ? 'DEP' : 'DEBIT'}\r\n` : '';
  return (
    `D${moment(transaction.timestamp).format(format)}\r\n` +
    `T${transaction.amount.toFixed(2)}\r\n` +
    `P${transaction.description}\r\n${lline}^\r\n`
  );
};

//  Transactions Serialization
const csv = transactions => transactions.map(csvTransaction).join('');
const qif = (transactions, type = 'default') =>
  `!Type:Bank\r\n${transactions.map(transaction => qifTransaction(transaction, type)).join('')}`;
const ofx = (transactions, account, from, to) => {
  const current = moment().format('YYYYMMDDHHmmss');
  const header = {
    OFXHEADER: '100',
    DATA: 'OFXSGML',
    VERSION: '102',
    SECURITY: 'NONE',
    ENCODING: 'USASCII',
    CHARSET: '1252',
    COMPRESSION: 'NONE',
    OLDFILEUID: 'NONE',
    NEWFILEUID: 'NONE',
  };

  const body = {
    SIGNONMSGSRSV1: {
      SONRS: {
        STATUS: {
          CODE: 0,
          SEVERITY: 'INFO',
        },
        DTSERVER: current,
        LANGUAGE: 'ENG',
      },
    },
  };

  //  BANKTRANLIST
  const translist = {
    DTSTART: moment(from, moment.formats.default).format('YYYYMMDD000000'),
    DTEND: moment(to, moment.formats.default).format('YYYYMMDD000000'),
    STMTTRN: transactions.map(t => ({
      TRNTYPE: t.amount > 0 ? 'CREDIT' : 'DEBIT',
      DTPOSTED: moment(t.timestamp).format('YYYYMMDD'),
      DTUSER: moment(t.timestamp).format('YYYYMMDD'),
      TRNAMT: t.amount.toFixed(2),
      //  use timestamp as FITID if necessary to fix the OFX missing FITID issue.
      FITID: t.receiptnumber || t.timestamp,
      MEMO: t.description.replace(';', ''),
    })),
  };

  if (account.type === 'DDA') {
    body.BANKMSGSRSV1 = {
      STMTTRNRS: {
        TRNUID: 1,
        STATUS: {
          CODE: 0,
          SEVERITY: 'INFO',
        },
        STMTRS: {
          CURDEF: 'AUD',
          BANKACCTFROM: {
            BANKID: account.bsb,
            ACCTID: account.account,
            ACCTTYPE: 'SAVINGS',
          },
          BANKTRANLIST: translist,
          LEDGERBAL: {
            BALAMT: account.balance,
            DTASOF: current,
          },
          AVAILBAL: {
            BALAMT: account.available,
            DTASOF: current,
          },
        },
      },
    };
  } else {
    body.CREDITCARDMSGSRSV1 = {
      CCSTMTTRNRS: {
        TRNUID: 1,
        STATUS: {
          CODE: 0,
          SEVERITY: 'INFO',
        },
        CCSTMTRS: {
          CURDEF: 'AUD',
          CCACCTFROM: {
            ACCTID: account.number,
          },
          BANKTRANLIST: translist,
          LEDGERBAL: {
            BALAMT: account.balance,
            DTASOF: current,
          },
          AVAILBAL: {
            BALAMT: account.available,
            DTASOF: current,
          },
        },
      },
    };
  }

  return ofxSerializer.serialize(header, body);
};

//  Exports
module.exports = {
  csv,
  qif,
  ofx,
};
