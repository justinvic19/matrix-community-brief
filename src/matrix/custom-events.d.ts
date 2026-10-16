import type { Brief } from '../domain/brief';
import 'matrix-js-sdk/lib/@types/event';
declare module 'matrix-js-sdk/lib/@types/event' {
  interface StateEvents { 'com.example.community_brief': Brief }
}
