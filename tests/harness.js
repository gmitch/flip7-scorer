// Loads appscript/Code.gs into a Node VM context with mock Apps Script globals,
// returning both the module-level functions and the mock spreadsheet so tests can
// inspect and manipulate the "sheet" directly.

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const {
  MockSpreadsheet,
  createMockSpreadsheetApp,
  mockLockService,
  mockContentService,
  mockUtilities,
} = require('./mocks');

const CODE_PATH = path.join(__dirname, '..', 'appscript', 'Code.gs');

function loadCodeGs({ spreadsheet } = {}) {
  const ss = spreadsheet || new MockSpreadsheet();
  const source = fs.readFileSync(CODE_PATH, 'utf8');

  const sandbox = {
    SpreadsheetApp: createMockSpreadsheetApp(ss),
    LockService: mockLockService,
    ContentService: mockContentService,
    Utilities: mockUtilities,
    console,
    Date,
    JSON,
    Math,
    Object,
    String,
    Number,
    Array,
    Error,
    isNaN,
    parseInt,
    parseFloat,
  };

  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'Code.gs' });

  return { sandbox, spreadsheet: ss };
}

module.exports = { loadCodeGs };
