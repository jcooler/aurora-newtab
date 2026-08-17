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
import RssWidget from './widgets/rss/RssWidget'
import StatusWidget from './widgets/status/StatusWidget'
import SunWidget from './widgets/sun/SunWidget'
import TimerWidget from './widgets/timer/TimerWidget'
import TodoWidget from './widgets/todo/TodoWidget'
import VercelWidget from './widgets/vercel/VercelWidget'
import WeatherWidget from './widgets/weather/WeatherWidget'
import { WIDGET_REGISTRY, type WidgetRendererKey } from './widgetRegistry'
import type { WidgetVariant } from '../lib/layout/types'
import type { UtilityTrayBridge } from './components/utilityTrayBridge'
import type { CanvasSize } from '../lib/layout/canvasTypes'

export interface WidgetRendererProps {
  stageVariant?: WidgetVariant
  canvasSize?: CanvasSize
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

const RENDERERS = {
  weather: (props) => (
    <WeatherWidget onExpandedChange={props.onWeatherExpandedChange} stageVariant={effectiveVariant(props)} />
  ),
  ics: (props) => <CalendarWidget stageVariant={effectiveVariant(props)} />,
  monthCal: (props) => <MonthCalWidget canvasSize={props.canvasSize} stageVariant={props.stageVariant} />,
  sun: () => <SunWidget />,
  moon: () => <MoonWidget />,
  quote: () => <QuoteWidget />,
  clock: () => <Clock />,
  greeting: () => <Greeting />,
  worldClocks: () => <WorldClocks />,
  countdown: () => <CountdownLine />,
  search: (props) => <SearchBar canvasSize={props.canvasSize} />,
  focus: () => <FocusLine />,
  links: () => <LinksWidget />,
  habits: () => <HabitsWidget />,
  bookmarks: ({ onBookmarksPopoverOpenChange, canvasSize }) => <BookmarksBar onPopoverOpenChange={onBookmarksPopoverOpenChange} canvasSize={canvasSize} />,
  status: (props) => <StatusWidget canvasSize={props.canvasSize} />,
  github: (props) => <GithubWidget canvasSize={props.canvasSize} />,
  gitlab: (props) => <GitlabWidget canvasSize={props.canvasSize} />,
  jira: (props) => <JiraWidget canvasSize={props.canvasSize} />,
  vercel: (props) => <VercelWidget canvasSize={props.canvasSize} />,
  homeassistant: (props) => <HomeAssistantWidget stageVariant={effectiveVariant(props)} utilityTray={props.utilityTray} />,
  rss: (props) => <RssWidget stageVariant={effectiveVariant(props)} />,
  crypto: (props) => <CryptoWidget canvasSize={props.canvasSize} />,
  timer: ({ onTimerOpenChange }) => <TimerWidget onOpenChange={onTimerOpenChange} />,
  tasks: ({ onTasksOpenChange }) => <TodoWidget onOpenChange={onTasksOpenChange} />,
  notes: ({ onNotesOpenChange }) => <NotesWidget onOpenChange={onNotesOpenChange} />,
} satisfies Record<WidgetRendererKey, WidgetRenderer>

export const WIDGET_RENDERER_KEYS: readonly WidgetRendererKey[] = Object.freeze(
  WIDGET_REGISTRY.map((entry) => entry.rendererKey),
)

export function resolveWidgetRenderer(key: WidgetRendererKey): WidgetRenderer {
  return RENDERERS[key]
}
