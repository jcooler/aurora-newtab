// Public-data widgets share Aurora's already-tested bounded resource shell.
// This semantic alias keeps provider widgets out of the Work namespace while
// preserving one dialog, focus, retry, and local-overflow implementation.
export {
  WorkConnectorSetup as GlanceSetup,
  WorkDockDetail as GlanceDockDetail,
  WorkResourceBody as GlanceResourceBody,
  WorkWidgetShell as GlanceWidgetShell,
} from '../work/WorkWidgetShell'
export {
  workPresentationState as glancePresentationState,
  workRowClass as glanceRowClass,
} from '../work/workPresentation'
