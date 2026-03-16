export interface UserRegisteredEventPayload {
  userId: string;
  email: string;
  role: string;
}

export interface UserEventsPublisher {
  publishUserRegistered(event: UserRegisteredEventPayload): Promise<void>;
}

export const USER_EVENTS_PUBLISHER = 'USER_EVENTS_PUBLISHER';
