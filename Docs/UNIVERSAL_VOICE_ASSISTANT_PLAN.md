---
name: Universal Voice Assistant
overview: Implement a single universal voice button that routes natural language commands to all existing app features (lists, events, recipes) using OpenRouter AI, with voice-based follow-up questions for clarifications.
todos:
  - id: backend-assistant-service
    content: Create backend/api/universal_assistant.py with UniversalAssistant class that processes commands via OpenRouter and routes to existing functions
    status: pending
  - id: backend-api-endpoint
    content: Add universal_assistant endpoint to backend/api/views.py and route to backend/api/urls.py
    status: pending
    dependencies:
      - backend-assistant-service
  - id: backend-env-config
    content: Add OPENROUTER_API_KEY to backend/.env and verify it loads in settings.py
    status: pending
  - id: frontend-assistant-service
    content: Create mobile/services/assistantService.ts for API communication with universal assistant endpoint
    status: pending
    dependencies:
      - backend-api-endpoint
  - id: frontend-assistant-hook
    content: Create mobile/hooks/useUniversalAssistant.ts hook that manages voice recognition, processes commands, handles voice-based follow-ups, and executes actions
    status: pending
    dependencies:
      - frontend-assistant-service
  - id: frontend-voice-button
    content: Create mobile/components/VoiceButton.tsx component that integrates with useUniversalAssistant hook and provides visual feedback
    status: pending
    dependencies:
      - frontend-assistant-hook
  - id: test-basic-commands
    content: "Test basic commands: add item, create event, search recipe with voice-based follow-ups"
    status: pending
    dependencies:
      - frontend-voice-button
  - id: test-complex-flows
    content: "Test complex multi-step flows: recipe import with URL, add ingredients to list with recipe selection"
    status: pending
    dependencies:
      - test-basic-commands
---

# Universal Voice Assistant Implementation Plan

## Overview

Create a single voice button that acts as a universal assistant, routing natural language commands to all existing app features. The assistant uses OpenRouter AI to understand intent and extract entities, then executes actions using existing backend functions. All follow-up questions are voice-based (not just UI).

## Architecture

```mermaid
flowchart TD
    A[User Presses Voice Button] --> B[Start Voice Recognition]
    B --> C[User Speaks Command]
    C --> D[Send to Backend API]
    D --> E[UniversalAssistant.process_command]
    E --> F[OpenRouter AI Analysis]
    F --> G{Action Type?}
    G -->|execute| H[Execute Action]
    G -->|ask_clarification| I[Speak Question]
    G -->|show_options| J[Speak Options]
    I --> K[Restart Voice Recognition]
    J --> K
    K --> C
    H --> L[Speak Confirmation]
    L --> M[Update UI/Refresh Data]
```

## Implementation Steps

### 1. Backend: Universal Assistant Service

**File**: `backend/api/universal_assistant.py` (NEW)

Create a service class that:
- Processes natural language commands via OpenRouter
- Routes to existing functions based on intent
- Returns structured responses with action types
- Handles all app features: lists, events, recipes, meal planning

**Key Methods**:
- `process_command(command: str) -> Dict`: Analyzes command and returns intent/entities
- `execute_action(intent_result: dict) -> Dict`: Executes the action using existing functions
- Helper methods for each feature type (add_item, create_event, search_recipe, etc.)

**Features to Support**:
1. **Add Item to List**: "I need creamer", "add milk to grocery list"
2. **Create Calendar Event**: "I have an appointment next Thursday at 4pm"
3. **Search Recipes**: "find me a recipe for turducken"
4. **Import Recipe**: "import recipe" (requires URL follow-up)
5. **Add Recipe Ingredients to List**: "add recipe ingredients to my grocery list"
6. **Create List**: "create a grocery list"
7. **Delete Item**: "remove milk from list"

### 2. Backend: API Endpoint

**File**: `backend/api/views.py`

Add new endpoint:
```python
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def universal_assistant(request):
    """Universal assistant endpoint that routes commands to features."""
```

**File**: `backend/api/urls.py`

Add route:
```python
path('universal-assistant/', views.universal_assistant, name='universal-assistant'),
```

### 3. Backend: Environment Configuration

**File**: `backend/.env`

Add OpenRouter API key:
```
OPENROUTER_API_KEY=sk-or-v1-xxxxxxxxxxxxx
```

**File**: `backend/config/settings.py`

Ensure environment variable is loaded (already using `python-dotenv`).

### 4. Frontend: Universal Assistant Hook

**File**: `mobile/hooks/useUniversalAssistant.ts` (NEW)

Create hook that:
- Manages voice recognition state
- Processes commands via API
- Handles voice-based follow-up questions
- Executes actions and provides voice feedback
- Manages conversation flow state

**Key Features**:
- Voice-based clarification loop (not just UI)
- Automatic voice recognition restart after questions
- State management for multi-step flows
- Integration with existing `useVoiceRecognition` hook

### 5. Frontend: Voice Button Component

**File**: `mobile/components/VoiceButton.tsx` (NEW)

Single reusable voice button component:
- Shows listening/processing states
- Integrates with `useUniversalAssistant` hook
- Can be placed anywhere in the app
- Visual feedback (pulsing when listening, etc.)

### 6. Frontend: Service Integration

**File**: `mobile/services/assistantService.ts` (NEW)

API service for universal assistant:
```typescript
async processCommand(command: string): Promise<AssistantResponse>
```

### 7. Integration Points

**Existing Services to Leverage**:
- `mobile/services/listService.ts` - For list operations
- `mobile/services/calendarService.ts` - For event creation
- `mobile/services/mealsService.ts` - For recipe operations
- `mobile/hooks/useVoiceRecognition.ts` - For voice input
- `mobile/utils/voiceFeedback.ts` - For voice output (speak function)

**Backend Functions to Leverage**:
- `backend/lists/models.py` - List and ListItem models
- `backend/events/models.py` - Event model
- `backend/meals/models.py` - Recipe model
- `backend/meals/importers.py` - Recipe import functionality
- `backend/api/views.py` - Existing ViewSets (EventViewSet, RecipeViewSet)

### 8. Voice-Based Follow-Up Flow

**Implementation Pattern**:

1. User says command → AI analyzes
2. If clarification needed → Speak question → Restart voice recognition
3. User responds → Process response → Continue or execute
4. If options needed → Speak options → Restart voice recognition
5. User selects → Execute action → Speak confirmation

**Example Flow**:
```
User: "I need creamer"
AI: "Which list would you like to add creamer to? Grocery, Shopping, or Other?"
[Voice recognition restarts automatically]
User: "Grocery"
AI: "Added creamer to Grocery List"
```

### 9. Error Handling

- Network errors: Voice feedback "Sorry, I'm having trouble connecting"
- Invalid commands: Voice feedback "I'm not sure what you mean. Please try again."
- Missing data: Voice-based clarification questions
- API errors: Graceful degradation with voice feedback

### 10. Testing Strategy

- Test each intent type (add item, create event, etc.)
- Test voice clarification flows
- Test error scenarios
- Test with various natural language phrasings
- Verify integration with existing features

## File Structure

```
backend/
  api/
    universal_assistant.py (NEW)
    views.py (MODIFY - add endpoint)
    urls.py (MODIFY - add route)

mobile/
  hooks/
    useUniversalAssistant.ts (NEW)
  components/
    VoiceButton.tsx (NEW)
  services/
    assistantService.ts (NEW)
```

## Dependencies

**Backend**:
- `requests` (already in requirements.txt)
- OpenRouter API key in environment

**Frontend**:
- Existing voice recognition (`@react-native-voice/voice`)
- Existing voice feedback (`expo-speech`)
- No new dependencies needed

## Cost Estimate

- Per command: ~500-800 tokens = $0.0005-0.001
- Single user (50 commands/day): ~$0.75-1.50/month
- Well within OpenRouter's $5/month free tier

## Success Criteria

1. Single voice button works from any screen
2. Routes commands to correct features
3. Voice-based follow-up questions (not just UI)
4. Integrates with all existing features
5. Natural language understanding works for common phrasings
6. Graceful error handling with voice feedback


