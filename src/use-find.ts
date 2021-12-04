import { computed, reactive, Ref, ComputedRef, unref, toRefs, watch } from 'vue-demi'
import debounce from 'just-debounce'
import { Params, Paginated } from './types'
import { getQueryInfo, getItemsFromQueryInfo } from './utils'
import { AnyData, Model } from './service-store/types'

interface UseFindOptions {
  model: any
  params: Params | ComputedRef<Params | null>
  fetchParams?: ComputedRef<Params | null | undefined>
  queryWhen?: ComputedRef<boolean>
  qid?: string
  local?: boolean
  immediate?: boolean
}
interface UseFindState {
  debounceTime: null | number
  qid: string
  isPending: boolean
  haveBeenRequested: boolean
  haveLoaded: boolean
  error: null | Error
  latestQuery: null | object
  isLocal: boolean
}
interface UseGetComputed<M> {
  items: ComputedRef<M[]>
  servicePath: ComputedRef<string>
  paginationData: ComputedRef<AnyData>
}

export function useFind<M extends Model = Model>({
  model = null,
  params = computed(() => null),
  fetchParams = computed(() => undefined),
  qid = 'default',
  queryWhen = computed(() => true),
  local = false,
  immediate = true,
}: UseFindOptions) {
  if (!model) {
    throw new Error(
      `No model provided for useFind(). Did you define and register it with FeathersPinia?`,
    )
  }

  const getParamsForFetch = (providedParams?: Params | Ref<Params>): Params | null => {
    const provided = unref(providedParams)
    const forFetch = unref(fetchParams)

    const paramsToUse =
      provided || provided === null
        ? provided
        : forFetch || forFetch === null
        ? forFetch
        : unref(params)

    return paramsToUse
  }

  const state = reactive<UseFindState>({
    qid,
    isPending: false,
    haveBeenRequested: false,
    haveLoaded: local,
    error: null,
    debounceTime: null,
    latestQuery: null,
    isLocal: local,
  })

  const computes: UseGetComputed<M> = {
    // The find getter
    items: computed(() => {
      const getterParams: any = unref(params)

      if (getterParams) {
        if (getterParams.paginate) {
          const serviceState = model.store
          const { defaultSkip, defaultLimit } = serviceState.pagination
          const skip = getterParams.query.$skip || defaultSkip
          const limit = getterParams.query.$limit || defaultLimit
          const pagination = computes.paginationData.value[getterParams.qid || state.qid] || {}
          const response = skip != null && limit != null ? { limit, skip } : {}
          const queryInfo = getQueryInfo(getterParams, response)
          const items = getItemsFromQueryInfo(pagination, queryInfo, serviceState.itemsById)
          return items
        } else {
          return model.findInStore(getterParams).data
        }
      } else {
        return []
      }
    }),
    paginationData: computed(() => {
      return model.store.pagination
    }),
    servicePath: computed(() => model.servicePath),
  }

  function find(params?: Params | Ref<Params>): Promise<M[] | Paginated<M>> | void {
    if (!queryWhen.value || state.isLocal) return

    params = unref(params)
    state.isPending = true
    state.haveBeenRequested = true

    return model.find(params).then((response: any) => {
      // To prevent thrashing, only clear error on response, not on initial request.
      state.error = null
      state.haveLoaded = true
      if (!Array.isArray(response)) {
        const queryInfo = getQueryInfo(params, response)
        queryInfo.response = response
        queryInfo.isOutdated = false
        state.latestQuery = queryInfo
      }
      state.isPending = false
      return response
    })
  }
  const methods = {
    findDebounced(params?: Params) {
      return find(params)
    },
  }
  function findProxy(params?: Params | Ref<Params>) {
    const paramsToUse = getParamsForFetch(params)

    if (paramsToUse && paramsToUse.debounce) {
      if (paramsToUse.debounce !== state.debounceTime) {
        methods.findDebounced = debounce(find, paramsToUse.debounce)
        state.debounceTime = paramsToUse.debounce
      }
      return methods.findDebounced(paramsToUse)
    } else if (paramsToUse) {
      return find(paramsToUse)
    } else {
      // Set error
    }
  }

  watch(
    () => [getParamsForFetch(), queryWhen.value],
    () => {
      findProxy()
    },
    { immediate },
  )

  return { ...computes, ...toRefs(state), find }
}
