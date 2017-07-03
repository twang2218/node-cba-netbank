/* eslint-disable no-undef */
const moment = require('../src/moment');

describe('moment.js', () => {
  it('should contains some formats', () => {
    expect(moment.formats.default).toBeDefined();
    expect(moment.formats.aus).toBeDefined();
    expect(moment.formats.us).toBeDefined();
    expect(moment.formats.sortable).toBeDefined();
  });
  it('should format date in right format', () => {
    //  2017-07-03T23:08:15+10:00
    const timestamp = 1499087295615;
    expect(moment(timestamp).format(moment.formats.default)).toEqual('03/07/2017');
    expect(moment(timestamp).format(moment.formats.aus)).toEqual('03/07/17');
    expect(moment(timestamp).format(moment.formats.us)).toEqual('07/03/17');
    expect(moment(timestamp).format(moment.formats.sortable)).toEqual('2017-07-03');
  });
  it('should format date in right timezone', () => {
    //  2017-07-03T00:12:11+10:00
    const timestamp = 1499004731767;
    expect(moment(timestamp).format(moment.formats.default)).toEqual('03/07/2017');
    expect(moment(timestamp).format(moment.formats.aus)).toEqual('03/07/17');
    expect(moment(timestamp).format(moment.formats.us)).toEqual('07/03/17');
    expect(moment(timestamp).format(moment.formats.sortable)).toEqual('2017-07-03');
  });
});
