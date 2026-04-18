// In-memory mocks for the Google Apps Script globals used by appscript/Code.gs.
// Only the surface area needed by getRoomState / saveRoomState / setup is modeled.

'use strict';

class MockRange {
  constructor(sheet, row, col) {
    this.sheet = sheet;
    this.row = row;
    this.col = col;
  }
  setValue(val) {
    while (this.sheet.data.length < this.row) this.sheet.data.push([]);
    const r = this.sheet.data[this.row - 1];
    while (r.length < this.col) r.push('');
    r[this.col - 1] = val;
    return this;
  }
  getValue() {
    const r = this.sheet.data[this.row - 1] || [];
    return r[this.col - 1];
  }
  setNumberFormat(fmt) {
    this.sheet.cellFormats[`${this.row},${this.col}`] = fmt;
    return this;
  }
}

class MockColumnRange {
  constructor(sheet, a1) {
    this.sheet = sheet;
    this.a1 = a1;
  }
  setNumberFormat(fmt) {
    this.sheet.columnFormats[this.a1] = fmt;
    return this;
  }
}

class MockDataRange {
  constructor(sheet) { this.sheet = sheet; }
  getValues() {
    // Return a deep-ish copy so callers can't mutate internal state.
    return this.sheet.data.map(row => row.slice());
  }
}

class MockSheet {
  constructor(name, initialData = []) {
    this.name = name;
    this.data = initialData.map(row => row.slice());
    this.columnFormats = {};
    this.cellFormats = {};
    this.frozenRows = 0;
  }
  appendRow(row) {
    this.data.push(row.slice());
  }
  getDataRange() {
    return new MockDataRange(this);
  }
  getRange(a, b) {
    if (typeof a === 'string') return new MockColumnRange(this, a);
    return new MockRange(this, a, b);
  }
  getLastRow() {
    return this.data.length;
  }
  setFrozenRows(n) {
    this.frozenRows = n;
  }
}

class MockSpreadsheet {
  constructor() { this.sheets = {}; }
  getSheetByName(name) { return this.sheets[name] || null; }
  insertSheet(name) {
    const s = new MockSheet(name);
    this.sheets[name] = s;
    return s;
  }
  getSheets() { return Object.values(this.sheets); }
  deleteSheet(target) {
    for (const [k, v] of Object.entries(this.sheets)) {
      if (v === target) delete this.sheets[k];
    }
  }
  getSpreadsheetTimeZone() { return 'America/New_York'; }
}

function createMockSpreadsheetApp(spreadsheet) {
  return {
    getActiveSpreadsheet: () => spreadsheet,
    flush: () => {},
  };
}

const mockUtilities = {
  formatDate: (date, tz, fmt) => {
    // Minimal implementation: supports 'MMMM' and 'd' formats used by cellToRoomCode
    const months = ['January','February','March','April','May','June',
                    'July','August','September','October','November','December'];
    if (fmt === 'MMMM') return months[date.getMonth()];
    if (fmt === 'd') return String(date.getDate());
    return String(date);
  },
};

const mockLockService = {
  getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }),
};

const mockContentService = {
  MimeType: { JSON: 'application/json' },
  createTextOutput: (text) => {
    const out = { _text: text, _mime: null };
    out.setMimeType = (m) => { out._mime = m; return out; };
    return out;
  },
};

module.exports = {
  MockSheet,
  MockSpreadsheet,
  createMockSpreadsheetApp,
  mockLockService,
  mockContentService,
  mockUtilities,
};
