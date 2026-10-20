import type { BookshelfMessage } from './bookshelf-service'

type WithoutType<T> = T extends unknown ? Omit<T, 'type'> : never
export const bookshelfRequest = async <T = any>(message: WithoutType<BookshelfMessage>): Promise<T> => {
  const response = await chrome.runtime.sendMessage({ ...message, type: 'bookshelf' })
  if (!response?.ok) throw new Error(response?.error || 'Could not update Bookshelf.')
  return response as T
}
export const bookshelfUrl = () => chrome.runtime.getURL('tabs/bookshelf.html')
export const bookshelfProUrl = () => chrome.runtime.getURL('options.html#pro')
