import { describe, expect, it, vi } from 'vitest'

import {
  daysUntilHoliday,
  fetchHolidayCountries,
  fetchPublicHolidays,
  isPublicHolidaysData,
  publicHolidayRequest,
  publicHolidaysScope,
} from './publicHolidays'

const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json' },
})

describe('Public Holidays provider boundary', () => {
  it('normalizes the available-country catalog', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(response([
      { countryCode: 'US', name: 'United States' },
      { countryCode: 'ca', name: 'Canada' },
      { countryCode: 'USA', name: 'Drop' },
      { countryCode: 'GB', name: '' },
    ]))
    await expect(fetchHolidayCountries(fetchFn)).resolves.toEqual([
      { countryCode: 'CA', name: 'Canada' },
      { countryCode: 'US', name: 'United States' },
    ])
    expect(fetchFn).toHaveBeenCalledWith(
      'https://date.nager.at/api/v3/AvailableCountries',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
  })

  it('requests current and next local years and keeps national public rows only', async () => {
    const now = new Date(2026, 11, 20, 12)
    expect(publicHolidayRequest(2026, 'us')).toBe('https://date.nager.at/api/v3/PublicHolidays/2026/US')
    expect(publicHolidaysScope('us', now)).toBe('public-holidays:v1:US:2026')
    const fetchFn = vi.fn<typeof fetch>(async (input) => {
      const year = String(input).includes('/2027/') ? 2027 : 2026
      return response(year === 2026 ? [
        { date: '2026-12-25', localName: 'Christmas Day', name: 'Christmas Day', countryCode: 'US', global: true, types: ['Public'] },
        { date: '2026-12-26', localName: 'State Day', name: 'State Day', countryCode: 'US', global: false, counties: ['US-XX'], types: ['Public'] },
        { date: '2026-12-27', localName: 'Observance', name: 'Observance', countryCode: 'US', global: true, types: ['Observance'] },
      ] : [
        { date: '2027-01-01', localName: "New Year's Day", name: "New Year's Day", countryCode: 'US', global: true, types: ['Public'] },
        { date: '2027-01-01', localName: "New Year's Day", name: "New Year's Day", countryCode: 'US', global: true, types: ['Public'] },
        { date: 'bad', localName: 'Bad', name: 'Bad', countryCode: 'US', global: true, types: ['Public'] },
      ])
    })

    const data = await fetchPublicHolidays('us', now, fetchFn)

    expect(fetchFn).toHaveBeenCalledTimes(2)
    expect(data).toEqual({
      countryCode: 'US',
      year: 2026,
      holidays: [
        { date: '2026-12-25', name: 'Christmas Day', localName: 'Christmas Day' },
        { date: '2027-01-01', name: "New Year's Day", localName: "New Year's Day" },
      ],
    })
    expect(isPublicHolidaysData(data)).toBe(true)
    expect(daysUntilHoliday('2027-01-01', now)).toBe(12)
  })

  it('fails either malformed year response without exposing provider bodies', async () => {
    const secret = 'holiday-provider-body-must-not-leak'
    const fetchFn = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response([]))
      .mockResolvedValueOnce(response({ secret }))
    let message = ''
    try {
      await fetchPublicHolidays('US', new Date(2026, 11, 20), fetchFn)
    } catch (error) {
      message = error instanceof Error ? error.message : String(error)
    }
    expect(message).toBe('Public Holidays is unavailable.')
    expect(message).not.toContain(secret)
  })
})
