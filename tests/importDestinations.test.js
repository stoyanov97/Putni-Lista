import { describe, it, expect } from 'vitest'
import { parseDestinationRows, readExcelRows, templateWorkbook } from '../src/lib/importDestinations.js'
import { resolveRoute } from '../src/lib/maps.js'

describe('импорт на дестинации от Excel', () => {
  it('разпознава колоните по заглавие, в произволен ред', () => {
    const rows = [
      ['База', 'Адрес', 'Наименование', 'Цел на посещението'],
      ['да', 'гр. София, ул. Тест 1', 'Офис', ''],
      ['', 'гр. Пловдив, бул. Х 2', 'Клиент А', 'Среща'],
    ]
    const { items, problems } = parseDestinationRows(rows)
    expect(problems).toEqual([])
    expect(items).toEqual([
      { name: 'Офис', address: 'гр. София, ул. Тест 1', purpose: null, is_base: true },
      { name: 'Клиент А', address: 'гр. Пловдив, бул. Х 2', purpose: 'Среща', is_base: false },
    ])
  })

  it('пропуска празни, непълни и дублирани редове с обяснение', () => {
    const rows = [
      ['Наименование', 'Адрес'],
      ['Клиент А', 'Адрес 1'],
      [],
      ['Без адрес', ''],
      ['клиент а', 'Адрес 2'],
      ['Съществуващ', 'Адрес 3'],
    ]
    const { items, problems } = parseDestinationRows(rows, [{ name: 'Съществуващ', is_base: false }])
    expect(items.map((i) => i.name)).toEqual(['Клиент А'])
    expect(problems).toHaveLength(3)
  })

  it('не допуска втора база', () => {
    const rows = [['Наименование', 'Адрес', 'База'], ['Нов офис', 'Адрес', 'да']]
    const { items, problems } = parseDestinationRows(rows, [{ name: 'Офис', is_base: true }])
    expect(items[0].is_base).toBe(false)
    expect(problems[0]).toMatch(/вече има база/)
  })

  it('отказва файл без задължителните колони', () => {
    expect(parseDestinationRows([['Име на файл', 'Нещо']]).problems[0]).toMatch(/Липсват/)
  })

  it('чете шаблона, който системата сама предлага', async () => {
    const buffer = await (await templateWorkbook()).xlsx.writeBuffer()
    const rows = await readExcelRows({ arrayBuffer: async () => buffer })
    const { items } = parseDestinationRows(rows)
    expect(items).toHaveLength(2)
    expect(items[0].address).toMatch(/Пловдив/)
  })
})

describe('маршрут → точки на картата', () => {
  const D = [
    { id: 1, name: 'Офис София', address: 'гр. София, ул. Х 1', lat: 42.7, lon: 23.3 },
    { id: 2, name: 'Склад „Бета“', address: 'гр. Божурище, ул. Y 1', lat: 42.76, lon: 23.2 },
  ]
  it('намира дестинациите по името с града', () => {
    expect(resolveRoute('Офис София – Склад „Бета“, Божурище – Офис София', D).map((p) => p.id)).toEqual([1, 2, 1])
  })
  it('градско пътуване и лично ползване', () => {
    expect(resolveRoute('Офис София – служебни ангажименти в населеното място – Офис София', D).map((p) => p.id)).toEqual([1])
    expect(resolveRoute('Лично ползване', D)).toEqual([])
  })
})
