import type {
  PilotLoadBalancePolicy,
  PilotRouteComboItem,
  PilotRoutingPolicy,
} from '../../utils/pilot-admin-routing-config'
import { requirePilotAdmin } from '../../utils/pilot-admin-auth'
import { updatePilotAdminRoutingConfig } from '../../utils/pilot-admin-routing-config'

interface RouteComboPatchBody {
  routeCombos?: PilotRouteComboItem[]
  lbPolicy?: Partial<PilotLoadBalancePolicy>
  routingPolicy?: Partial<PilotRoutingPolicy>
}

export default defineEventHandler(async (event) => {
  await requirePilotAdmin(event)
  const body = await readBody<RouteComboPatchBody>(event)
  const config = await updatePilotAdminRoutingConfig(event, {
    routeCombos: Array.isArray(body?.routeCombos) ? body.routeCombos : undefined,
    lbPolicy: body?.lbPolicy,
    routingPolicy: body?.routingPolicy,
  })

  return {
    ok: true,
    routeCombos: config.routeCombos,
    lbPolicy: config.lbPolicy,
    routingPolicy: config.routingPolicy,
  }
})
