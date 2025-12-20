import { useEffect, useState, useRef } from 'react';
import { Platform } from 'react-native';
import { speak } from '../utils/voiceFeedback';
import {
  parseDeleteEvent,
  normalizeText,
  parseDate,
  parseTime,
  findMatchingItems,
  capitalizeWords
} from '../utils/voiceCommands';
import { Event } from '../services/calendarService';

interface VoiceEventState {
  isActive: boolean;
  step: 'name' | 'date' | 'time' | 'location' | 'notes' | null;
  title: string;
  date: Date | null;
  time: { hour: number; minute: number } | null;
  location: string;
  notes: string;
}

interface UseCalendarVoiceCommandsOptions {
  transcript: string;
  isSupported: boolean;
  selectedFamily: any;
  events: Event[];
  isListening: boolean;
  start: (options?: { ignoreTranscriptsForMs?: number }) => void;
  stop: () => void;
  reset: () => void;
  showDeleteModal: boolean;
  showCreateForm: boolean;
  selectedEvent: Event | null;
  onOpenCreateForm: (open: boolean) => void;
  onSetFormData: (data: any) => void;
  onSetSelectedEvent: (event: Event | null) => void;
  onShowDeleteModal: (show: boolean) => void;
  onDeleteConfirm: () => void;
  onCreateEventDirectly: (eventData: any) => Promise<void>;
  convertLocalDateTimeToISO: (localDateTimeStr: string) => string | null;
  onSubmitForm: () => void;
}

export function useCalendarVoiceCommands({
  transcript,
  isSupported,
  selectedFamily,
  events,
  isListening,
  start,
  stop,
  reset,
  showDeleteModal,
  showCreateForm,
  selectedEvent,
  onOpenCreateForm,
  onSetFormData,
  onSetSelectedEvent,
  onShowDeleteModal,
  onDeleteConfirm,
  onCreateEventDirectly,
  convertLocalDateTimeToISO,
  onSubmitForm,
}: UseCalendarVoiceCommandsOptions) {
  const [voiceEventState, setVoiceEventState] = useState<VoiceEventState>({
    isActive: false,
    step: null,
    title: '',
    date: null,
    time: null,
    location: '',
    notes: ''
  });
  const [awaitingCreateConfirmation, setAwaitingCreateConfirmation] = useState(false);
  const [pendingEventData, setPendingEventData] = useState<any>(null);
  const [awaitingNumberSelection, setAwaitingNumberSelection] = useState(false);
  const [pendingMatches, setPendingMatches] = useState<Event[]>([]);
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  // Refs for delete modal handling
  const deleteTriggerTranscript = useRef<string | null>(null);
  const deleteModalOpenTime = useRef<number | null>(null);
  const deleteModalJustOpened = useRef(false);
  const lastProcessedTranscript = useRef<{ text: string; timestamp: number } | null>(null);
  const isProcessingRef = useRef(false);
  const stepTransitionTime = useRef<number | null>(null);

  // Handle voice commands
  useEffect(() => {
    // Only process if we have a valid transcript
    if (!transcript || !isSupported || !selectedFamily) return;

    const text = transcript.toLowerCase().trim();

    // Skip empty transcripts
    if (!text) return;

    // Skip if it's the same as last processed (but allow after a short delay to handle retries)
    const isInNameStep = voiceEventState.isActive && voiceEventState.step === 'name';
    const timeSinceLastProcess = lastProcessedTranscript.current ?
      Date.now() - (lastProcessedTranscript.current.timestamp || 0) : Infinity;

    if (!isInNameStep) {
      if (text === lastProcessedTranscript.current?.text && timeSinceLastProcess < 1000) {
        return;
      }
    }

    // Prevent concurrent processing
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;

    const handleVoiceCommand = async () => {
      let normalizedText: string;
      try {
        normalizedText = normalizeText(text);
      } catch (err) {
        console.error('Error normalizing text:', err);
        normalizedText = text.toLowerCase().trim();
      }

      try {
        // CRITICAL: If delete modal is open, ONLY process delete confirmation/cancellation
        if (showDeleteModal && selectedEvent) {
          if (deleteTriggerTranscript.current && text === deleteTriggerTranscript.current) {
            reset();
            isProcessingRef.current = false;
            return;
          }

          const timeSinceModalOpened = deleteModalOpenTime.current
            ? Date.now() - deleteModalOpenTime.current
            : Infinity;

          const normalizedTextForCheck = normalizedText || text.toLowerCase().trim();
          const isShortConfirmation = ['delete', 'yes', 'ok', 'okay', 'no', 'cancel'].some(word =>
            normalizedTextForCheck === word || normalizedTextForCheck === word + '.' || normalizedTextForCheck === word + ','
          );

          if (isShortConfirmation && timeSinceModalOpened >= 3000) {
            // Continue to process below
          } else if (deleteModalJustOpened.current || timeSinceModalOpened < 3000) {
            reset();
            isProcessingRef.current = false;
            return;
          }

          const eventTitleLower = selectedEvent?.title?.toLowerCase() || '';
          if ((text.includes('delete event') || text.includes(eventTitleLower)) && !isShortConfirmation) {
            reset();
            isProcessingRef.current = false;
            return;
          }

          const confirmKeywords = ['delete', 'yes', 'confirm', 'ok', 'okay', 'proceed', 'do it'];
          const cancelKeywords = ['cancel', 'no', 'stop', 'never mind', 'abort'];

          const normalizedTextForConfirm = normalizedText || text.toLowerCase().trim();
          const isConfirmation = confirmKeywords.some(keyword => normalizedTextForConfirm.includes(keyword));

          if (isConfirmation) {
            stop();
            reset();
            if (onDeleteConfirm) {
              onDeleteConfirm();
            }
            isProcessingRef.current = false;
            return;
          } else if (cancelKeywords.some(keyword => normalizedTextForConfirm.includes(keyword))) {
            stop();
            reset();
            if (onShowDeleteModal) {
              onShowDeleteModal(false);
            }
            speak('Deletion cancelled.');
            isProcessingRef.current = false;
            return;
          }
          reset();
          isProcessingRef.current = false;
          return;
        }

        // CANCELLATION: Check for cancel at any time during the flow
        const cancelKeywords = ['cancel', 'stop', 'never mind', 'forget it', 'abort', 'quit', 'nevermind'];
        const normalizedTextForCancel = normalizeText(text);
        const isCancel = cancelKeywords.some(keyword => {
          const textLower = text.toLowerCase();
          const normalizedLower = normalizedTextForCancel.toLowerCase();
          return textLower.includes(keyword) || normalizedLower.includes(keyword) ||
                 textLower === keyword || normalizedLower === keyword ||
                 textLower.startsWith(keyword) || normalizedLower.startsWith(keyword);
        });

        if (isCancel) {
          console.log('🎤 [VOICE] Cancel detected:', text);
          lastProcessedTranscript.current = { text, timestamp: Date.now() };
          stop();
          reset();
          setVoiceEventState({
            isActive: false,
            step: null,
            title: '',
            date: null,
            time: null,
            location: '',
            notes: ''
          });
          setAwaitingCreateConfirmation(false);
          setPendingEventData(null);
          speak('Cancelled. Event creation stopped.');
          isProcessingRef.current = false;
          return;
        }

        // SIMPLIFIED FLOW: Handle multi-step event creation flow
        if (voiceEventState.isActive) {
          // STEP 1: NAME - Collect event title
          if (voiceEventState.step === 'name') {
            console.log('🎤 [VOICE] Processing name step');
            let title = text.trim();
            title = title.replace(/add\s+to\s+calendar/gi, '').trim();
            const normalizedTextForTitle = normalizeText(text);
            title = normalizedTextForTitle.replace(/add\s+to\s+calendar/gi, '').trim() || title;
            title = title.replace(/\s+/g, ' ').trim();

            const addToCalendarMatch = /^add\s+to\s+calendar\s*$/i.test(text) || /^add\s+to\s+calendar$/i.test(normalizedText);

            if (addToCalendarMatch || title.length === 0) {
              console.log('🎤 [VOICE] Ignoring - only "add to calendar" or empty, waiting for event name');
              isProcessingRef.current = false;
              return;
            }

            if (title && title.length > 0) {
              console.log('🎤 [VOICE] ✅ Event name received:', title);
              stop();
              reset();
              lastProcessedTranscript.current = { text, timestamp: Date.now() };
              setVoiceEventState(prev => ({
                ...prev,
                step: 'date',
                title: capitalizeWords(title)
              }));
              stepTransitionTime.current = Date.now();
              speak(`Event name: ${capitalizeWords(title)}. What day?`, () => {
                setTimeout(() => {
                  console.log('🎤 [VOICE] Restarting mic for date step');
                  reset();
                  start();
                }, 1000);
              });
              isProcessingRef.current = false;
              return;
            } else {
              console.log('🎤 [VOICE] Empty/invalid transcript in name step, waiting for event name');
              isProcessingRef.current = false;
              return;
            }
          // STEP 2: DATE - Collect event date
          } else if (voiceEventState.step === 'date') {
            console.log('🎤 [VOICE] Processing date step');

            if (stepTransitionTime.current) {
              const timeSinceTransition = Date.now() - stepTransitionTime.current;
              if (timeSinceTransition < 2000) {
                console.log('🎤 [VOICE] Ignoring transcript too soon after step transition');
                isProcessingRef.current = false;
                return;
              }
            }

            if (!text || text.length < 2) {
              console.log('🎤 [VOICE] Ignoring empty/short transcript in date step');
              isProcessingRef.current = false;
              return;
            }

            if (text === lastProcessedTranscript.current?.text) {
              const timeSinceLast = Date.now() - (lastProcessedTranscript.current.timestamp || 0);
              if (timeSinceLast < 2000) {
                console.log('🎤 [VOICE] Ignoring duplicate transcript in date step');
                isProcessingRef.current = false;
                return;
              }
            }

            const date = parseDate(text);
            console.log('🎤 [VOICE] Parsed date:', date);

            if (date) {
              console.log('🎤 [VOICE] ✅ Date received:', date);
              stepTransitionTime.current = null;
              stop();
              reset();
              lastProcessedTranscript.current = { text, timestamp: Date.now() };
              setVoiceEventState(prev => ({
                ...prev,
                step: 'time',
                date: date
              }));
              stepTransitionTime.current = Date.now();
              const dateStr = date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
              speak(`Date: ${dateStr}. What time?`, () => {
                setTimeout(() => {
                  console.log('🎤 [VOICE] Restarting mic for time step');
                  reset();
                  start();
                }, 1000);
              });
              isProcessingRef.current = false;
              return;
            } else {
              const skipMatch = text.match(/(skip|today|now|default)/);
              if (skipMatch) {
                console.log('🎤 [VOICE] ✅ Skip/today detected, using today');
                stop();
                reset();
                lastProcessedTranscript.current = { text, timestamp: Date.now() };
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                setVoiceEventState(prev => ({
                  ...prev,
                  step: 'time',
                  date: today
                }));
                const dateStr = today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
                speak(`Using today: ${dateStr}. What time?`, () => {
                  setTimeout(() => {
                    console.log('🎤 [VOICE] Restarting mic for time step');
                    reset();
                    start();
                  }, 1000);
                });
                isProcessingRef.current = false;
                return;
              } else {
                if (text && text.length > 0) {
                  console.log('🎤 [VOICE] Could not parse date, asking again');
                  speak('I did not understand that date. Please say today, tomorrow, or a specific date like November 27.', () => {
                    setTimeout(() => {
                      start();
                    }, 500);
                  });
                  reset();
                  isProcessingRef.current = false;
                  return;
                } else {
                  console.log('🎤 [VOICE] Empty transcript in date step, waiting for date');
                  isProcessingRef.current = false;
                  return;
                }
              }
            }
          // STEP 3: TIME - Collect event time
          } else if (voiceEventState.step === 'time') {
            console.log('🎤 [VOICE] Processing time step');

            if (!text || text.length < 2) {
              console.log('🎤 [VOICE] Ignoring empty/short transcript in time step');
              isProcessingRef.current = false;
              return;
            }

            if (text === lastProcessedTranscript.current?.text) {
              const timeSinceLast = Date.now() - (lastProcessedTranscript.current.timestamp || 0);
              if (timeSinceLast < 2000) {
                console.log('🎤 [VOICE] Ignoring duplicate transcript in time step');
                isProcessingRef.current = false;
                return;
              }
            }

            const time = parseTime(text);
            if (time) {
              console.log('🎤 [VOICE] ✅ Time received:', time);
              stepTransitionTime.current = null;
              stop();
              reset();
              lastProcessedTranscript.current = { text, timestamp: Date.now() };
              setVoiceEventState(prev => ({
                ...prev,
                step: 'location',
                time: time
              }));
              stepTransitionTime.current = Date.now();
              const timeDisplay = new Date().setHours(time.hour, time.minute, 0, 0);
              const timeStr = new Date(timeDisplay).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
              speak(`Time: ${timeStr}. Any location? Say the location or "skip".`, () => {
                setTimeout(() => {
                  console.log('🎤 [VOICE] Restarting mic for location step');
                  reset();
                  start();
                }, 1000);
              });
              isProcessingRef.current = false;
              return;
            } else {
              const skipMatch = text.match(/(skip|none|no time|all day)/);
              if (skipMatch) {
                const eventDate = voiceEventState.date || new Date();
                eventDate.setHours(12, 0, 0, 0);

                const year = eventDate.getFullYear();
                const month = String(eventDate.getMonth() + 1).padStart(2, '0');
                const day = String(eventDate.getDate()).padStart(2, '0');
                const dateStr = `${year}-${month}-${day}T12:00`;
                const endDateStr = `${year}-${month}-${day}T13:00`;

                if (onSetFormData && onOpenCreateForm) {
                  onSetFormData((prev: any) => ({
                    ...prev,
                    title: voiceEventState.title,
                    starts_at: dateStr,
                    ends_at: endDateStr,
                    is_all_day: true,
                  }));
                  onOpenCreateForm(true);
                }

                const dateDisplay = eventDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
                speak(`Creating all-day event: ${voiceEventState.title} on ${dateDisplay}. Please review and save.`);

                setVoiceEventState({
                  isActive: false,
                  step: null,
                  title: '',
                  date: null,
                  time: null,
                  location: '',
                  notes: ''
                });
                reset();
                isProcessingRef.current = false;
                return;
              } else {
                speak('I did not understand that time. Please say a time like 3pm or 10:30am, or say "all day" for an all-day event.');
                reset();
                isProcessingRef.current = false;
                return;
              }
            }
          // STEP 4: LOCATION - Collect event location
          } else if (voiceEventState.step === 'location') {
            console.log('🎤 [VOICE] Processing location step');

            if (stepTransitionTime.current) {
              const timeSinceTransition = Date.now() - stepTransitionTime.current;
              if (timeSinceTransition < 2000) {
                console.log('🎤 [VOICE] Ignoring transcript too soon after step transition');
                isProcessingRef.current = false;
                return;
              }
            }

            if (!text || text.length < 2) {
              console.log('🎤 [VOICE] Ignoring empty/short transcript in location step');
              isProcessingRef.current = false;
              return;
            }

            if (lastProcessedTranscript.current) {
              const timeSinceLast = Date.now() - (lastProcessedTranscript.current.timestamp || 0);
              if (text === lastProcessedTranscript.current.text && timeSinceLast < 3000) {
                console.log('🎤 [VOICE] Ignoring duplicate transcript in location step');
                isProcessingRef.current = false;
                return;
              }
            }

            const skipMatch = text.match(/(skip|none|no|nope|no location)/);
            let location = '';
            if (!skipMatch) {
              location = text.trim();
            }

            console.log('🎤 [VOICE] ✅ Location received:', location || 'none');
            stepTransitionTime.current = null;
            stop();
            reset();
            lastProcessedTranscript.current = { text, timestamp: Date.now() };

            setVoiceEventState(prev => ({
              ...prev,
              step: 'notes',
              location: location
            }));
            stepTransitionTime.current = Date.now();

            if (location) {
              speak(`Location: ${capitalizeWords(location)}. Any notes? Say the notes or "skip".`, () => {
                setTimeout(() => {
                  console.log('🎤 [VOICE] Restarting mic for notes step');
                  reset();
                  start();
                }, 1000);
              });
            } else {
              speak('No location. Any notes? Say the notes or "skip".', () => {
                setTimeout(() => {
                  console.log('🎤 [VOICE] Restarting mic for notes step');
                  reset();
                  start();
                }, 1000);
              });
            }
            isProcessingRef.current = false;
            return;
          // STEP 5: NOTES - Collect event notes
          } else if (voiceEventState.step === 'notes') {
            console.log('🎤 [VOICE] Processing notes step');

            if (stepTransitionTime.current) {
              const timeSinceTransition = Date.now() - stepTransitionTime.current;
              if (timeSinceTransition < 2000) {
                console.log('🎤 [VOICE] Ignoring transcript too soon after step transition');
                isProcessingRef.current = false;
                return;
              }
            }

            if (!text || text.length < 2) {
              console.log('🎤 [VOICE] Ignoring empty/short transcript in notes step');
              isProcessingRef.current = false;
              return;
            }

            if (lastProcessedTranscript.current) {
              const timeSinceLast = Date.now() - (lastProcessedTranscript.current.timestamp || 0);
              if (text === lastProcessedTranscript.current.text && timeSinceLast < 3000) {
                console.log('🎤 [VOICE] Ignoring duplicate transcript in notes step');
                isProcessingRef.current = false;
                return;
              }
            }

            const skipMatch = text.match(/(skip|none|no|nope|no notes)/);
            let notes = '';
            if (!skipMatch) {
              notes = text.trim();
            }

            console.log('🎤 [VOICE] ✅ Notes received:', notes || 'none');
            stepTransitionTime.current = null;
            stop();
            reset();
            lastProcessedTranscript.current = { text, timestamp: Date.now() };

            const eventDate = voiceEventState.date ? new Date(voiceEventState.date) : new Date();
            const eventDateTime = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate());
            if (voiceEventState.time) {
              eventDateTime.setHours(voiceEventState.time.hour, voiceEventState.time.minute, 0, 0);
            } else {
              eventDateTime.setHours(12, 0, 0, 0);
            }

            const year = eventDateTime.getFullYear();
            const month = String(eventDateTime.getMonth() + 1).padStart(2, '0');
            const day = String(eventDateTime.getDate()).padStart(2, '0');
            const hours = String(eventDateTime.getHours()).padStart(2, '0');
            const minutes = String(eventDateTime.getMinutes()).padStart(2, '0');
            const dateStr = `${year}-${month}-${day}T${hours}:${minutes}`;

            const endDate = new Date(eventDateTime);
            endDate.setHours(endDate.getHours() + 1);
            const endYear = endDate.getFullYear();
            const endMonth = String(endDate.getMonth() + 1).padStart(2, '0');
            const endDay = String(endDate.getDate()).padStart(2, '0');
            const endHours = String(endDate.getHours()).padStart(2, '0');
            const endMinutes = String(endDate.getMinutes()).padStart(2, '0');
            const endDateStr = `${endYear}-${endMonth}-${endDay}T${endHours}:${endMinutes}`;

            const eventData = {
              title: voiceEventState.title,
              location: voiceEventState.location || '',
              notes: notes || '',
              starts_at: dateStr,
              ends_at: endDateStr,
              is_all_day: false,
            };

            const timeDisplay = eventDateTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
            const dateDisplay = eventDateTime.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
            let confirmMsg = `I'll create an event: ${voiceEventState.title} on ${dateDisplay} at ${timeDisplay}`;
            if (voiceEventState.location) {
              confirmMsg += ` at ${voiceEventState.location}`;
            }
            if (notes) {
              confirmMsg += `. Notes: ${notes}`;
            }

            setPendingEventData(eventData);
            setAwaitingCreateConfirmation(true);

            setVoiceEventState({
              isActive: false,
              step: null,
              title: '',
              date: null,
              time: null,
              location: '',
              notes: ''
            });
            speak(confirmMsg + '. Add to calendar or review?', () => {
              setTimeout(() => {
                console.log('🎤 [VOICE] Restarting mic for confirmation');
                reset();
                start();
              }, 1000);
            });
            isProcessingRef.current = false;
            return;
          }
        }

        // CONFIRMATION: Handle create confirmation
        if (awaitingCreateConfirmation && pendingEventData) {
          console.log('🎤 [VOICE] Processing confirmation step');

          if (!text || text.length < 2) {
            console.log('🎤 [VOICE] Ignoring empty/short transcript in confirmation step');
            isProcessingRef.current = false;
            return;
          }

          if (text === lastProcessedTranscript.current?.text) {
            const timeSinceLast = Date.now() - (lastProcessedTranscript.current.timestamp || 0);
            if (timeSinceLast < 2000) {
              console.log('🎤 [VOICE] Ignoring duplicate transcript in confirmation step');
              isProcessingRef.current = false;
              return;
            }
          }

          const lowerText = text.toLowerCase().trim();
          const normalizedTextForConfirm = normalizeText(text);

          const exactAddToCalendar = /^add\s+to\s+calendar\s*$/i.test(text) || /^add\s+to\s+calendar$/i.test(normalizedTextForConfirm);
          const createNow = exactAddToCalendar || /(?:add it|add|yes|yep|yeah|create|create it|create now|do it|go ahead|ok|okay|sure)/.test(lowerText);
          const openForm = /(?:no|review|show me|let me see|edit|change|modify|form|see it)/.test(lowerText);

          console.log('🎤 [VOICE] Confirmation matching:', { createNow, openForm, text });

          if (createNow && !openForm) {
            console.log('🎤 [VOICE] ✅ Creating event directly');
            stop();
            reset();
            lastProcessedTranscript.current = { text, timestamp: Date.now() };
            try {
              if (onCreateEventDirectly) {
                await onCreateEventDirectly(pendingEventData);
              }
              setAwaitingCreateConfirmation(false);
              setPendingEventData(null);
              speak('Event added to calendar.');
            } catch (error: any) {
              speak(`Sorry, I couldn't create the event. ${error.message || 'Please try again.'}`);
            }
            isProcessingRef.current = false;
            return;
          } else if (openForm) {
            console.log('🎤 [VOICE] ✅ Opening form for review');
            stop();
            reset();
            lastProcessedTranscript.current = { text, timestamp: Date.now() };
            if (onSetFormData && onOpenCreateForm) {
              onSetFormData((prev: any) => ({
                ...prev,
                title: pendingEventData.title || '',
                location: pendingEventData.location || '',
                notes: pendingEventData.notes || '',
                starts_at: pendingEventData.starts_at,
                ends_at: pendingEventData.ends_at,
                is_all_day: pendingEventData.is_all_day || false,
              }));
              onOpenCreateForm(true);
            }
            setAwaitingCreateConfirmation(false);
            setPendingEventData(null);
            speak('Form opened. Say "add to calendar" to create the event, or "cancel" to close.', () => {
              setTimeout(() => {
                console.log('🎤 [VOICE] Restarting mic for form confirmation');
                reset();
                start();
              }, 1000);
            });
            isProcessingRef.current = false;
            return;
          } else {
            console.log('🎤 [VOICE] Unclear response, asking again');
            speak('Add to calendar or review?', () => {
              setTimeout(() => {
                reset();
                start();
              }, 1000);
            });
            reset();
            isProcessingRef.current = false;
            return;
          }
        }

        // FORM OPEN: Handle voice commands when create form is open
        if (showCreateForm && !showDeleteModal && !awaitingCreateConfirmation) {
          console.log('🎤 [VOICE] Processing form open step');

          if (!text || text.length < 2) {
            console.log('🎤 [VOICE] Ignoring empty/short transcript in form open step');
            isProcessingRef.current = false;
            return;
          }

          if (text === lastProcessedTranscript.current?.text) {
            const timeSinceLast = Date.now() - (lastProcessedTranscript.current.timestamp || 0);
            if (timeSinceLast < 2000) {
              console.log('🎤 [VOICE] Ignoring duplicate transcript in form open step');
              isProcessingRef.current = false;
              return;
            }
          }

          const lowerText = text.toLowerCase().trim();
          const normalizedTextForForm = normalizeText(text);

          const saveKeywords = ['save', 'create', 'add to calendar', 'add it', 'submit', 'done', 'finish', 'yes', 'ok', 'okay'];
          const isSave = saveKeywords.some(keyword => {
            const textLower = text.toLowerCase();
            const normalizedLower = normalizedTextForForm.toLowerCase();
            return textLower.includes(keyword) || normalizedLower.includes(keyword) ||
                   textLower === keyword || normalizedLower === keyword ||
                   textLower.startsWith(keyword) || normalizedLower.startsWith(keyword);
          });

          const cancelKeywords = ['cancel', 'close', 'no', 'never mind', 'forget it'];
          const isCancel = cancelKeywords.some(keyword => {
            const textLower = text.toLowerCase();
            const normalizedLower = normalizedTextForForm.toLowerCase();
            return textLower.includes(keyword) || normalizedLower.includes(keyword) ||
                   textLower === keyword || normalizedLower === keyword;
          });

          if (isSave) {
            console.log('🎤 [VOICE] ✅ Save command detected when form is open');
            stop();
            reset();
            lastProcessedTranscript.current = { text, timestamp: Date.now() };
            if (onSubmitForm) {
              onSubmitForm();
            }
            speak('Saving event.');
            isProcessingRef.current = false;
            return;
          } else if (isCancel) {
            console.log('🎤 [VOICE] ✅ Cancel command detected when form is open');
            stop();
            reset();
            lastProcessedTranscript.current = { text, timestamp: Date.now() };
            if (onOpenCreateForm) {
              onOpenCreateForm(false);
            }
            speak('Cancelled.');
            isProcessingRef.current = false;
            return;
          }
          isProcessingRef.current = false;
          return;
        }

        // Parse delete event command
        const deleteEventCmd = parseDeleteEvent(text);
        if (deleteEventCmd) {
          stop();
          reset();

          const eventList = events.map(e => e);

          const matches = findMatchingItems(eventList, deleteEventCmd.title, (event) => event.title);
          const sortedMatches = [...matches].sort((a, b) => {
            const dateA = new Date(a.starts_at);
            const dateB = new Date(b.starts_at);
            return dateA.getTime() - dateB.getTime();
          });

          if (sortedMatches.length === 0) {
            speak('Sorry, I could not find that event.');
            isProcessingRef.current = false;
            return;
          } else if (sortedMatches.length === 1) {
            const event = sortedMatches[0];

            deleteTriggerTranscript.current = text;

            stop();
            reset();

            setTimeout(() => {
              if (onSetSelectedEvent) {
                onSetSelectedEvent(event);
              }
              if (onShowDeleteModal) {
                onShowDeleteModal(true);
              }
              deleteModalOpenTime.current = Date.now();
              deleteModalJustOpened.current = true;

              const eventDate = new Date(event.starts_at);
              const dateStr = eventDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
              const timeStr = event.is_all_day
                ? 'all day'
                : eventDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

              speak(`${event.title} on ${dateStr} at ${timeStr}. Confirm deletion.`);
            }, 200);
            isProcessingRef.current = false;
            return;
          } else {
            let message = 'I found multiple matching events. Please specify which one to delete: ';
            sortedMatches.forEach((event, index) => {
              const eventDate = new Date(event.starts_at);
              const dateStr = eventDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
              const timeStr = event.is_all_day
                ? 'all day'
                : eventDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
              message += `${index + 1}: ${event.title} on ${dateStr} at ${timeStr}. `;
            });
            setPendingMatches(sortedMatches);
            setPendingAction('delete');
            setAwaitingNumberSelection(true);
            speak(message, () => {
              setTimeout(() => {
                start();
              }, 500);
            });
            isProcessingRef.current = false;
            return;
          }
        }

        // Handle number selection for multiple matches
        if (awaitingNumberSelection) {
          stop();
          reset();

          const numberWords: Record<string, number> = {
            'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
            'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10
          };

          const cleanedText = text.trim().toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, '');

          let number = null;
          if (/^\d+$/.test(cleanedText)) {
            number = parseInt(cleanedText);
          } else if (numberWords[cleanedText]) {
            number = numberWords[cleanedText];
          }

          if (number !== null && number >= 1 && number <= pendingMatches.length) {
            const selected = pendingMatches[number - 1];

            if (pendingAction === 'delete') {
              deleteTriggerTranscript.current = text;

              stop();
              reset();

              setTimeout(() => {
                if (onSetSelectedEvent) {
                  onSetSelectedEvent(selected);
                }
                if (onShowDeleteModal) {
                  onShowDeleteModal(true);
                }
                deleteModalOpenTime.current = Date.now();
                deleteModalJustOpened.current = true;

                const eventDate = new Date(selected.starts_at);
                const dateStr = eventDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                const timeStr = selected.is_all_day
                  ? 'all day'
                  : eventDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

                speak(`${selected.title} on ${dateStr} at ${timeStr}. Confirm deletion.`);
              }, 200);
            }
            setAwaitingNumberSelection(false);
            setPendingMatches([]);
            setPendingAction(null);
            isProcessingRef.current = false;
            return;
          } else {
            speak('Invalid selection. Please try again.');
            setAwaitingNumberSelection(false);
            setPendingMatches([]);
            setPendingAction(null);
            isProcessingRef.current = false;
            return;
          }
        }

        // Check if user said "add to calendar" to start interactive flow
        const normalizedTextForAdd = normalizeText(text);
        const addToCalendarMatch = /^add\s+to\s+calendar\s*$/i.test(text) || /^add\s+to\s+calendar$/i.test(normalizedTextForAdd);

        if (!voiceEventState.isActive && !awaitingCreateConfirmation && addToCalendarMatch) {
          console.log('🎤 [VOICE] Starting interactive flow - setting step to name');
          lastProcessedTranscript.current = { text, timestamp: Date.now() };

          stop();
          reset();

          stepTransitionTime.current = null;
          setVoiceEventState({
            isActive: true,
            step: 'name',
            title: '',
            date: null,
            time: null,
            location: '',
            notes: ''
          });
          speak('What is the name of the event?', () => {
            setTimeout(() => {
              lastProcessedTranscript.current = null;
              console.log('🎤 [VOICE] Restarting recognition for event name');
              start();
            }, 500);
          });
          isProcessingRef.current = false;
          return;
        }

        // No command matched
        if (voiceEventState.isActive || awaitingCreateConfirmation || awaitingNumberSelection) {
          stop();
          speak('Say "add to calendar" to start creating an event, or "delete event" followed by the event name.');
          reset();
        } else {
          reset();
        }
      } catch (error) {
        console.error('Error processing voice command:', error);
        speak('Sorry, there was an error. Please try again.');
        reset();
      } finally {
        lastProcessedTranscript.current = { text, timestamp: Date.now() };
        isProcessingRef.current = false;
      }
    };

    handleVoiceCommand();
  }, [
    transcript, events, awaitingNumberSelection, pendingMatches, pendingAction,
    selectedFamily, voiceEventState, awaitingCreateConfirmation, pendingEventData,
    isSupported, start, stop, reset, showDeleteModal, showCreateForm, selectedEvent,
    onOpenCreateForm, onSetFormData, onSetSelectedEvent,
    onShowDeleteModal, onDeleteConfirm, onCreateEventDirectly, onSubmitForm
  ]);

  const handleVoiceClick = () => {
    if (!isSupported) {
      if (Platform.OS === 'web') {
        alert('Speech recognition is not supported in this browser.');
      }
      return;
    }

    if (isListening) {
      stop();
      reset();
      lastProcessedTranscript.current = null;
      isProcessingRef.current = false;
      return;
    }

    // Reset state
    reset();
    lastProcessedTranscript.current = null;
    isProcessingRef.current = false;
    setAwaitingNumberSelection(false);
    setPendingMatches([]);
    setPendingAction(null);

    // Start recognition briefly to capture user gesture (required for permission)
    // Then stop it, speak instruction, and restart after instruction finishes
    try {
      start();
      setTimeout(() => {
        stop();
        // Give the native module time to clean up before speaking
        setTimeout(() => {
          speak('Say "add to calendar" to start creating an event, or "delete event" followed by the event name.', () => {
            // Add a longer delay on mobile to ensure Voice module is ready
            const delay = Platform.OS === 'web' ? 300 : 1000;
            setTimeout(() => {
              // Wrap in try-catch to prevent crashes if voice recognition fails
              try {
                start();
              } catch (err: any) {
                console.error('Error restarting voice recognition after speech:', err);
                // Don't show alert - just log the error and continue
                // The user can try again by clicking the mic button
              }
            }, delay);
          });
        }, Platform.OS === 'web' ? 0 : 200);
      }, 100);
    } catch (err) {
      console.error('Error starting recognition:', err);
      if (Platform.OS === 'web') {
        alert('Unable to start voice recognition. Please check your microphone permissions.');
      } else {
        // On mobile, just log the error - don't show alert that might crash
        console.error('Voice recognition not available on this device');
      }
    }
  };

  return {
    handleVoiceClick,
    voiceEventState,
    setVoiceEventState,
    awaitingCreateConfirmation,
    setAwaitingCreateConfirmation,
    pendingEventData,
    setPendingEventData,
    deleteModalJustOpened,
    deleteModalOpenTime,
    deleteTriggerTranscript
  };
}

