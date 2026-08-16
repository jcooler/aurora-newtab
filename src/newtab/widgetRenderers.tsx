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

export interface WidgetRendererProps {
  stageVariant?: WidgetVariant
  onWeatherExpandedChange?: (open: boolean) => void
  onBookmarksPopoverOpenChange?: (open: boolean) => void
  onNotesOpenChange?: (open: boolean) => void
  onTasksOpenChange?: (open: boolean) => void
  onTimerOpenChange?: (open: boolean) => void
  utilityTray?: UtilityTrayBridge
}

export type WidgetRenderer = ComponentType<WidgetRendererProps>

const RENDERERS = {
  weather: ({ onWeatherExpandedChange, stageVariant }) => (
    <WeatherWidget onExpandedChange={onWeatherExpandedChange} stageVariant={stageVariant} />
  ),
  ics: ({ stageVariant }) => <CalendarWidget stageVariant={stageVariant} />,
  monthCal: () => <MonthCalWidget />,
  sun: () => <SunWidget />,
  moon: () => <MoonWidget />,
  quote: () => <QuoteWidget />,
  clock: () => <Clock />,
  greeting: () => <Greeting />,
  worldClocks: () => <WorldClocks />,
  countdown: () => <CountdownLine />,
  search: () => <SearchBar />,
  focus: () => <FocusLine />,
  links: () => <LinksWidget />,
  habits: () => <HabitsWidget />,
  bookmarks: ({ onBookmarksPopoverOpenChange }) => <BookmarksBar onPopoverOpenChange={onBookmarksPopoverOpenChange} />,
  status: () => <StatusWidget />,
  github: () => <GithubWidget />,
  gitlab: () => <GitlabWidget />,
  jira: () => <JiraWidget />,
  vercel: () => <VercelWidget />,
  homeassistant: ({ stageVariant, utilityTray }) => <HomeAssistantWidget stageVariant={stageVariant} utilityTray={utilityTray} />,
  rss: ({ stageVariant }) => <RssWidget stageVariant={stageVariant} />,
  crypto: () => <CryptoWidget />,
  timer: ({ onTimerOpenChange, utilityTray }) => <TimerWidget onOpenChange={onTimerOpenChange} utilityTray={utilityTray} />,
  tasks: ({ onTasksOpenChange, utilityTray }) => <TodoWidget onOpenChange={onTasksOpenChange} utilityTray={utilityTray} />,
  notes: ({ onNotesOpenChange, utilityTray }) => <NotesWidget onOpenChange={onNotesOpenChange} utilityTray={utilityTray} />,
} satisfies Record<WidgetRendererKey, WidgetRenderer>

export const WIDGET_RENDERER_KEYS: readonly WidgetRendererKey[] = Object.freeze(
  WIDGET_REGISTRY.map((entry) => entry.rendererKey),
)

export function resolveWidgetRenderer(key: WidgetRendererKey): WidgetRenderer {
  return RENDERERS[key]
}
