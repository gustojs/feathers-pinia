import { ServiceState, ServiceOptions } from './types'

export function makeState(options: ServiceOptions) {
  return (): ServiceState => ({
    clientAlias: options.clientAlias || 'api',
    servicePath: options.servicePath,
    idField: options.idField || 'id',
    ids: [],
    itemsById: {},
    pagination: {},
    clonesById: {},
  })
}
