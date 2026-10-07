const config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.ts'],
  clearMocks: true,
  collectCoverage: false,
  collectCoverageFrom: ['src/**/*.{ts,js}', '!src/**/*.test.ts', '!src/**/*.test.js'],
  coverageDirectory: 'coverage',
  moduleFileExtensions: ['ts', 'js', 'json', 'node']
};

module.exports = config;