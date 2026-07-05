import { useQuery } from '@tanstack/react-query'
import { getSubscriptionUsage, getSubscriptionInfo } from '../api'

export function useSubscriptionUsage() {
  return useQuery({
    queryKey: ['subscription', 'usage'],
    queryFn: async () => {
      const res = await getSubscriptionUsage()
      return res.data
    },
    staleTime: 60 * 1000,
  })
}

export function useSubscriptionInfo() {
  return useQuery({
    queryKey: ['subscription', 'info'],
    queryFn: async () => {
      const res = await getSubscriptionInfo()
      return res.data
    },
    staleTime: 60 * 1000,
  })
}
