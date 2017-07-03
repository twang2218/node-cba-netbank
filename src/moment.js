const moment = require('moment-timezone');

moment.tz.setDefault('Australia/Sydney');

moment.format = {
  default: 'DD/MM/YYYY',
  aus: 'DD/MM/YY',
  us: 'MM/DD/YY',
  sortable: 'YYYY-MM-DD',
};

module.exports = moment;
