/* eslint-disable no-undef */
const serializer = require('../src/serializer');
const moment = require('../src/moment');

describe('serializer.js', () => {
  const transactions = [
    {
      timestamp: 1499087295615,
      pending: true,
      description: 'PENDING - YUMCHA',
      amount: -123,
      balance: 0,
    },
    {
      timestamp: 1499004731767,
      description: 'CAFE',
      amount: 12.3,
      balance: 1234.12,
    },
  ];

  const accountDDA = {
    name: 'Smart Access',
    bsb: '2012',
    account: '12345678',
    number: '201212345678',
    balance: 1234.56,
    available: 1034.56,
    type: 'DDA',
  };

  const accountMCD = {
    name: 'Master Card',
    bsb: '',
    account: '5020012345678901',
    number: '5020012345678901',
    balance: -1234.56,
    available: 12345.56,
    type: 'MCD',
  };

  it('should be able to serialize to CSV', () => {
    expect(serializer.csv(transactions)).toEqual('03/07/2017,"-123.00","PENDING - YUMCHA","0.00"\r\n03/07/2017,"+12.30","CAFE","+1234.12"\r\n');
  });
  it('should be able to serialize to QIF (default)', () => {
    expect(serializer.qif(transactions)).toEqual('!Type:Bank\r\n' +
        'D03/07/2017\r\n' +
        'T-123.00\r\n' +
        'PPENDING - YUMCHA\r\n' +
        'LDEBIT\r\n' +
        '^\r\n' +
        'D03/07/2017\r\n' +
        'T12.30\r\n' +
        'PCAFE\r\n' +
        'LDEP\r\n' +
        '^\r\n');
  });
  it('should be able to serialize to QIF (old Quicken AUS)', () => {
    expect(serializer.qif(transactions, 'aus')).toEqual('!Type:Bank\r\n' +
        'D03/07/17\r\n' +
        'T-123.00\r\n' +
        'PPENDING - YUMCHA\r\n' +
        '^\r\n' +
        'D03/07/17\r\n' +
        'T12.30\r\n' +
        'PCAFE\r\n' +
        '^\r\n');
  });
  it('should be able to serialize to QIF (old Quicken US)', () => {
    expect(serializer.qif(transactions, 'us')).toEqual('!Type:Bank\r\n' +
        'D07/03/17\r\n' +
        'T-123.00\r\n' +
        'PPENDING - YUMCHA\r\n' +
        '^\r\n' +
        'D07/03/17\r\n' +
        'T12.30\r\n' +
        'PCAFE\r\n' +
        '^\r\n');
  });
  it('should be able to serialize to OFX (DDA)', () => {
    expect(serializer.ofx(transactions, accountDDA, '01/07/2017', '05/07/2017')).toEqual('OFXHEADER:100\n' +
        'DATA:OFXSGML\n' +
        'VERSION:102\n' +
        'SECURITY:NONE\n' +
        'ENCODING:USASCII\n' +
        'CHARSET:1252\n' +
        'COMPRESSION:NONE\n' +
        'OLDFILEUID:NONE\n' +
        'NEWFILEUID:NONE\n' +
        '\n' +
        '<OFX>\n' +
        '<SIGNONMSGSRSV1>\n' +
        '<SONRS>\n' +
        '<STATUS>\n' +
        '<CODE>0\n' +
        '<SEVERITY>INFO\n' +
        '</STATUS>\n' +
        `<DTSERVER>${moment().format('YYYYMMDDHHmmss')}\n` +
        '<LANGUAGE>ENG\n' +
        '</SONRS>\n' +
        '</SIGNONMSGSRSV1>\n' +
        '<BANKMSGSRSV1>\n' +
        '<STMTTRNRS>\n' +
        '<TRNUID>1\n' +
        '<STATUS>\n' +
        '<CODE>0\n' +
        '<SEVERITY>INFO\n' +
        '</STATUS>\n' +
        '<STMTRS>\n' +
        '<CURDEF>AUD\n' +
        '<BANKACCTFROM>\n' +
        '<BANKID>2012\n' +
        '<ACCTID>12345678\n' +
        '<ACCTTYPE>SAVINGS\n' +
        '</BANKACCTFROM>\n' +
        '<BANKTRANLIST>\n' +
        '<DTSTART>20170701000000\n' +
        '<DTEND>20170705000000\n' +
        '<STMTTRN>\n' +
        '<TRNTYPE>DEBIT\n' +
        '<DTPOSTED>20170703\n' +
        '<DTUSER>20170703\n' +
        '<TRNAMT>-123.00\n' +
        '<FITID>1499087295615\n' +
        '<MEMO>PENDING - YUMCHA\n' +
        '</STMTTRN>\n' +
        '<STMTTRN>\n' +
        '<TRNTYPE>CREDIT\n' +
        '<DTPOSTED>20170703\n' +
        '<DTUSER>20170703\n' +
        '<TRNAMT>12.30\n' +
        '<FITID>1499004731767\n' +
        '<MEMO>CAFE\n' +
        '</STMTTRN>\n' +
        '</BANKTRANLIST>\n' +
        '<LEDGERBAL>\n' +
        '<BALAMT>1234.56\n' +
        `<DTASOF>${moment().format('YYYYMMDDHHmmss')}\n` +
        '</LEDGERBAL>\n' +
        '<AVAILBAL>\n' +
        '<BALAMT>1034.56\n' +
        `<DTASOF>${moment().format('YYYYMMDDHHmmss')}\n` +
        '</AVAILBAL>\n' +
        '</STMTRS>\n' +
        '</STMTTRNRS>\n' +
        '</BANKMSGSRSV1>\n' +
        '</OFX>\n');
  });
  it('should be able to serialize to OFX (CreditCard)', () => {
    expect(serializer.ofx(transactions, accountMCD, '01/07/2017', '05/07/2017')).toEqual('OFXHEADER:100\n' +
        'DATA:OFXSGML\n' +
        'VERSION:102\n' +
        'SECURITY:NONE\n' +
        'ENCODING:USASCII\n' +
        'CHARSET:1252\n' +
        'COMPRESSION:NONE\n' +
        'OLDFILEUID:NONE\n' +
        'NEWFILEUID:NONE\n' +
        '\n' +
        '<OFX>\n' +
        '<SIGNONMSGSRSV1>\n' +
        '<SONRS>\n' +
        '<STATUS>\n' +
        '<CODE>0\n' +
        '<SEVERITY>INFO\n' +
        '</STATUS>\n' +
        `<DTSERVER>${moment().format('YYYYMMDDHHmmss')}\n` +
        '<LANGUAGE>ENG\n' +
        '</SONRS>\n' +
        '</SIGNONMSGSRSV1>\n' +
        '<CREDITCARDMSGSRSV1>\n' +
        '<CCSTMTTRNRS>\n' +
        '<TRNUID>1\n' +
        '<STATUS>\n' +
        '<CODE>0\n' +
        '<SEVERITY>INFO\n' +
        '</STATUS>\n' +
        '<CCSTMTRS>\n' +
        '<CURDEF>AUD\n' +
        '<CCACCTFROM>\n' +
        '<ACCTID>5020012345678901\n' +
        '</CCACCTFROM>\n' +
        '<BANKTRANLIST>\n' +
        '<DTSTART>20170701000000\n' +
        '<DTEND>20170705000000\n' +
        '<STMTTRN>\n' +
        '<TRNTYPE>DEBIT\n' +
        '<DTPOSTED>20170703\n' +
        '<DTUSER>20170703\n' +
        '<TRNAMT>-123.00\n' +
        '<FITID>1499087295615\n' +
        '<MEMO>PENDING - YUMCHA\n' +
        '</STMTTRN>\n' +
        '<STMTTRN>\n' +
        '<TRNTYPE>CREDIT\n' +
        '<DTPOSTED>20170703\n' +
        '<DTUSER>20170703\n' +
        '<TRNAMT>12.30\n' +
        '<FITID>1499004731767\n' +
        '<MEMO>CAFE\n' +
        '</STMTTRN>\n' +
        '</BANKTRANLIST>\n' +
        '<LEDGERBAL>\n' +
        '<BALAMT>-1234.56\n' +
        `<DTASOF>${moment().format('YYYYMMDDHHmmss')}\n` +
        '</LEDGERBAL>\n' +
        '<AVAILBAL>\n' +
        '<BALAMT>12345.56\n' +
        `<DTASOF>${moment().format('YYYYMMDDHHmmss')}\n` +
        '</AVAILBAL>\n' +
        '</CCSTMTRS>\n' +
        '</CCSTMTTRNRS>\n' +
        '</CREDITCARDMSGSRSV1>\n' +
        '</OFX>\n');
  });
});
