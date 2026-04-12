import { describe, it, expect } from 'vitest'
import { validateConfig, mergeWithDefaults, isConfigComplete } from './config'

describe('OpenAI Config', () => {
  describe('validateConfig', () => {
    it('should pass valid config', () => {
      const result = validateConfig({
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-test',
        model: 'gpt-4o',
        maxTokens: 4096,
        temperature: 0.7,
      })
      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('should fail on invalid baseUrl', () => {
      const result = validateConfig({ baseUrl: 'not-a-url' })
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('baseUrl must be a valid URL')
    })

    it('should fail on empty apiKey', () => {
      const result = validateConfig({ apiKey: '' })
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('apiKey cannot be empty string')
    })

    it('should fail on invalid maxTokens', () => {
      const result = validateConfig({ maxTokens: 0 })
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('maxTokens must be at least 1')
    })

    it('should fail on invalid temperature', () => {
      const result = validateConfig({ temperature: 3 })
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('temperature must be between 0 and 2')
    })
  })

  describe('mergeWithDefaults', () => {
    it('should merge with defaults', () => {
      const config = mergeWithDefaults({ apiKey: 'sk-test' })
      expect(config.baseUrl).toBe('https://api.openai.com/v1')
      expect(config.model).toBe('gpt-4o')
      expect(config.apiKey).toBe('sk-test')
    })
  })

  describe('isConfigComplete', () => {
    it('should return true for complete config', () => {
      expect(isConfigComplete({
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-test',
        model: 'gpt-4o',
      })).toBe(true)
    })

    it('should return false for incomplete config', () => {
      expect(isConfigComplete({ apiKey: 'sk-test' })).toBe(false)
      expect(isConfigComplete({})).toBe(false)
    })
  })
})
