import type { ComponentType } from 'react'
import Clock from './components/Clock'
import FocusLine from './components/FocusLine'
import Greeting from './components/Greeting'
import SearchBar from './components/SearchBar'
import BookmarksBar from './widgets/bookmarks/BookmarksBar'
import CalendarWidget from './widgets/calendar/CalendarWidget'
import WorldClocks from './widgets/clocks/WorldClocks'
import CountdownLine from './widgets/countdown/CountdownLine'
import CryptoWidget from './widgets/crypto/CryptoWidget'
import DownloadsWidget from './widgets/downloads/DownloadsWidget'
import GithubWidget from './widgets/github/GithubWidget'
import GitlabWidget from './widgets/gitlab/GitlabWidget'
import HabitsWidget from './widgets/habits/HabitsWidget'
import HomeAssistantWidget from './widgets/homeassistant/HomeAssistantWidget'
import JiraWidget from './widgets/jira/JiraWidget'
import LinksWidget from './widgets/links/LinksWidget'
import MonthCalWidget from './widgets/monthcal/MonthCalWidget'
import MoonWidget from './widgets/moon/MoonWidget'
import NotesWidget from './widgets/notes/NotesWidget'
import QuoteWidget from './widgets/quote/QuoteWidget'
import ReadingListWidget from './widgets/readingList/ReadingListWidget'
import RecentlyClosedWidget from './widgets/recentlyClosed/RecentlyClosedWidget'
import RssWidget from './widgets/rss/RssWidget'
import StatusWidget from './widgets/status/StatusWidget'
import SunWidget from './widgets/sun/SunWidget'
import TabGroupsWidget from './widgets/tabGroups/TabGroupsWidget'
import TimerWidget from './widgets/timer/TimerWidget'
import TodoWidget from './widgets/todo/TodoWidget'
import VercelWidget from './widgets/vercel/VercelWidget'
import WeatherWidget from './widgets/weather/WeatherWidget'
import LinearWidget from './widgets/linear/LinearWidget'
import SentryWidget from './widgets/sentry/SentryWidget'
import TodoistWidget from './widgets/todoist/TodoistWidget'
import OnThisDayWidget from './widgets/glance/OnThisDayWidget'
import PublicHolidaysWidget from './widgets/glance/PublicHolidaysWidget'
import AuroraKpWidget from './widgets/glance/AuroraKpWidget'
import type { WidgetRendererKey } from './widgetRegistry'
import type { WidgetVariant } from '../lib/layout/types'
import type { UtilityTrayBridge } from './components/utilityTrayBridge'
import type { CanvasSize } from '../lib/layout/canvasTypes'

export type WidgetPresentationMode = 'free' | 'stack' | 'docked'

export interface WidgetRendererProps {
  stageVariant?: WidgetVariant
  canvasSize?: CanvasSize
  /** The current composition context. This is layout-local presentation only;
   *  it does not create another widget owner or change persisted widget data. */
  presentation?: WidgetPresentationMode
  /** The Docked tier (named-layouts spec 2.3): render the one dense line.
   *  A widget is docked OR free, never both, so the widget keeps sole
   *  ownership of its data and panels in either presentation. */
  docked?: boolean
  onWeatherExpandedChange?: (open: boolean) => void
  onBookmarksPopoverOpenChange?: (open: boolean) => void
  onNotesOpenChange?: (open: boolean) => void
  onTasksOpenChange?: (open: boolean) => void
  onTimerOpenChange?: (open: boolean) => void
  utilityTray?: UtilityTrayBridge
}

export type WidgetRenderer = ComponentType<WidgetRendererProps>

function effectiveVariant({ stageVariant, canvasSize }: WidgetRendererProps): WidgetVariant | undefined {
  if (stageVariant) return stageVariant
  if (canvasSize === 'full') return 'expanded'
  return canvasSize
}

export const WIDGET_RENDERERS = {
  weather: (props) => (
    <WeatherWidget onExpandedChange={props.onWeatherExpandedChange} stageVariant={effectiveVariant(props)} docked={props.docked} />
  ),
  ics: (props) => <CalendarWidget stageVariant={effectiveVariant(props)} canvasSize={props.canvasSize} docked={props.docked} />,
  monthCal: (props) => <MonthCalWidget canvasSize={props.canvasSize} stageVariant={props.stageVariant} />,
  sun: (props) => <SunWidget canvasSize={props.canvasSize} docked={props.docked} />,
  moon: (props) => <MoonWidget canvasSize={props.canvasSize} docked={props.docked} />,
  quote: (props) => <QuoteWidget canvasSize={props.canvasSize} presentation={props.presentation} />,
  clock: (props) => <Clock canvasSize={props.canvasSize} presentation={props.presentation} docked={props.docked} />,
  greeting: (props) => <Greeting canvasSize={props.canvasSize} presentation={props.presentation} />,
  worldClocks: (props) => <WorldClocks canvasSize={props.canvasSize} presentation={props.presentation} docked={props.docked} />,
  countdown: (props) => <CountdownLine canvasSize={props.canvasSize} presentation={props.presentation} docked={props.docked} />,
  search: (props) => <SearchBar canvasSize={props.canvasSize} presentation={props.presentation} />,
  focus: (props) => <FocusLine canvasSize={props.canvasSize} presentation={props.presentation} />,
  links: (props) => <LinksWidget canvasSize={props.canvasSize} presentation={props.presentation} />,
  habits: (props) => <HabitsWidget canvasSize={props.canvasSize} docked={props.docked} />,
  bookmarks: ({ onBookmarksPopoverOpenChange, canvasSize }) => <BookmarksBar onPopoverOpenChange={onBookmarksPopoverOpenChange} canvasSize={canvasSize} />,
  status: (props) => <StatusWidget canvasSize={props.canvasSize} docked={props.docked} />,
  github: (props) => <GithubWidget canvasSize={props.canvasSize} docked={props.docked} />,
  gitlab: (props) => <GitlabWidget canvasSize={props.canvasSize} docked={props.docked} />,
  jira: (props) => <JiraWidget canvasSize={props.canvasSize} docked={props.docked} />,
  vercel: (props) => <VercelWidget canvasSize={props.canvasSize} docked={props.docked} />,
  homeassistant: (props) => <HomeAssistantWidget stageVariant={effectiveVariant(props)} utilityTray={props.utilityTray} docked={props.docked} />,
  rss: (props) => <RssWidget stageVariant={effectiveVariant(props)} docked={props.docked} />,
  crypto: (props) => <CryptoWidget canvasSize={props.canvasSize} docked={props.docked} />,
  readingList: (props) => <ReadingListWidget canvasSize={props.canvasSize} docked={props.docked} />,
  recentlyClosed: (props) => <RecentlyClosedWidget canvasSize={props.canvasSize} docked={props.docked} />,
  downloads: (props) => <DownloadsWidget canvasSize={props.canvasSize} docked={props.docked} />,
  tabGroups: (props) => <TabGroupsWidget canvasSize={props.canvasSize} docked={props.docked} />,
  timer: ({ onTimerOpenChange, canvasSize, docked }) => <TimerWidget onOpenChange={onTimerOpenChange} canvasSize={canvasSize} docked={docked} />,
  tasks: ({ onTasksOpenChange, canvasSize, docked }) => <TodoWidget onOpenChange={onTasksOpenChange} canvasSize={canvasSize} docked={docked} />,
  notes: ({ onNotesOpenChange, canvasSize, docked }) => <NotesWidget onOpenChange={onNotesOpenChange} canvasSize={canvasSize} docked={docked} />,
  linear: (props) => <LinearWidget canvasSize={props.canvasSize} docked={props.docked} />,
  sentry: (props) => <SentryWidget canvasSize={props.canvasSize} docked={props.docked} />,
  todoist: (props) => <TodoistWidget canvasSize={props.canvasSize} docked={props.docked} />,
  onThisDay: (props) => <OnThisDayWidget canvasSize={props.canvasSize} docked={props.docked} />,
  publicHolidays: (props) => <PublicHolidaysWidget canvasSize={props.canvasSize} docked={props.docked} />,
  auroraKp: (props) => <AuroraKpWidget canvasSize={props.canvasSize} docked={props.docked} />,
} satisfies Record<WidgetRendererKey, WidgetRenderer>

export const WIDGET_RENDERER_KEYS: readonly WidgetRendererKey[] = Object.freeze(
  Object.keys(WIDGET_RENDERERS) as WidgetRendererKey[],
)

export function resolveWidgetRenderer(key: WidgetRendererKey): WidgetRenderer {
  return WIDGET_RENDERERS[key]
}
