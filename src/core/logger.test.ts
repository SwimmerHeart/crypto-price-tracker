import { createLogger, resolveLevel } from './logger'
import { test, expect } from '@jest/globals'

function capture(options: Parameters<typeof createLogger>[0] = {}) {
  const lines: string[] = []
  const log = createLogger({ level: 'debug', ...options, write: (l: string) => lines.push(l) })
  return { lines, log, parse: () => JSON.parse(lines[0]!) }
}

test('пишет запись когда уровень подходит', () => {
  const { lines, log, parse } = capture({ level: 'info' })

  log.info('hello')

  expect(lines).toHaveLength(1)
  expect(parse().message).toBe('hello')
  expect(parse().level).toBe('info')
  expect(parse().time).toEqual(expect.any(String))
})

test('child дописывает bindings во все строки', () => {
  const { lines, log, parse } = capture()

  log.child({ requestId: 'abc123' }).info('запрос принят')
  log.child({ requestId: 'abc123' }).debug('обращение к CMC')

  expect(lines).toHaveLength(2)
  expect(parse().requestId).toBe('abc123')
  expect(JSON.parse(lines[1]!).requestId).toBe('abc123')
  expect(JSON.parse(lines[1]!).message).toBe('обращение к CMC')
})

test('base из createLogger попадает в каждую строку, fields перекрывает base', () => {
  const { lines, log, parse } = capture({ base: { service: 'tracker', port: 0 } })

  log.info('старт', { port: 3000 })

  expect(parse().service).toBe('tracker')
  expect(parse().port).toBe(3000)
})

test('не пишет запись ниже порога', () => {
  const { lines, log } = capture({ level: 'info' })

  log.debug('скрыто')
  log.trace('тоже скрыто')

  expect(lines).toHaveLength(0)
})

test('silent не пишет ничего даже на error', () => {
  const { lines, log } = capture({ level: 'silent' })

  log.error('всё равно тихо')

  expect(lines).toHaveLength(0)
})

test('Error в полях превращается в name/message/stack, а не в пустой объект', () => {
  const { log, parse } = capture()

  log.error('упало', { cause: new Error('boom') })

  expect(parse().cause).toEqual({
    name: 'Error',
    message: 'boom',
    stack: expect.any(String)
  })
});

test('циклическая ссылка не роняет логгер и пишет fallback-строку', () => {
  const { lines, log, parse } = capture()
  const obj: Record<string, unknown> = { name: 'loop' }
  obj.self = obj

  expect(() => log.error('цикл', { obj })).not.toThrow()

  expect(lines).toHaveLength(1)
  expect(parse().note).toBe('serialization failed')
  expect(parse().message).toBe('цикл')
})

test('обязательные поля нельзя подделать через fields', () => {
  const { log, parse } = capture()

  log.info('привет', { level: 'trace', message: 'подмена', time: '00:00' })

  expect(parse().level).toBe('info')
  expect(parse().message).toBe('привет')
  expect(parse().time).not.toBe('00:00')
});

test('resolveLevel отбрасывает мусор и подставляет info', () => {
  expect(resolveLevel('debug')).toBe('debug')
  expect(resolveLevel('error')).toBe('error')
  expect(resolveLevel('banana')).toBe('info')
  expect(resolveLevel('')).toBe('info')
  expect(resolveLevel(undefined)).toBe('info')
})
