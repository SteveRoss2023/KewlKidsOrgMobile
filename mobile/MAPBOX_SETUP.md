# MapBox Setup Instructions

This guide will help you set up MapBox for the KewlKids Organizer mobile app. MapBox provides an alternative map implementation that you can compare with the existing `react-native-maps` implementation.

## Getting a Free MapBox API Key

### Step 1: Create a MapBox Account

1. Go to [https://account.mapbox.com/auth/signup/](https://account.mapbox.com/auth/signup/)
2. Sign up with your email address, or use your GitHub/Google account for faster registration
3. Verify your email address if required

### Step 2: Get Your Access Token

1. After logging in, navigate to [https://account.mapbox.com/access-tokens/](https://account.mapbox.com/access-tokens/)
2. You'll see a "Default public token" - this is your access token
3. Copy this token (it starts with `pk.`)

**Important**: Keep your access token secure and never commit it to version control.

### Step 3: Configure the Token in Your App

1. Create a `.env` file in the `mobile/` directory if it doesn't exist
2. Add your MapBox access token to the `.env` file:

```bash
EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN=pk.your_token_here
```

3. Replace `pk.your_token_here` with your actual token from Step 2

### Step 4: Restart Your Development Server

After adding the token to your `.env` file:

1. Stop your Expo development server (Ctrl+C)
2. Clear the cache and restart:
   ```bash
   cd mobile
   npx expo start --clear
   ```

## Free Tier Limits

MapBox offers a generous free tier that's perfect for development and testing:

- **50,000 map loads per month** (free)
- **50,000 geocoding requests per month** (free)
- **No credit card required** for the free tier
- Suitable for development, testing, and small-scale production use

## Usage

Once configured, you can access the MapBox map implementation by:

1. Opening the app
2. Navigating to the Home screen
3. Tapping the "Map(MapBox)" card

The MapBox implementation provides the same functionality as the standard Map implementation:
- Location sharing with family members
- Map type selection (Standard, Satellite, Hybrid)
- Location tracking toggle
- Reset view functionality

## Troubleshooting

### Token Not Found Error

If you see "MapBox access token not configured":

1. Verify your `.env` file exists in the `mobile/` directory
2. Check that the variable name is exactly `EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN`
3. Ensure the token starts with `pk.`
4. Restart your development server with `--clear` flag

### Map Not Loading

1. Verify your token is valid by checking it at [https://account.mapbox.com/access-tokens/](https://account.mapbox.com/access-tokens/)
2. Check your internet connection
3. Review the console for any error messages
4. Ensure you've restarted the development server after adding the token

### Native Build Issues

**Important**: MapBox requires a development build - it does NOT work with Expo Go.

#### Creating a Development Build

You have two options:

**Option 1: Using EAS Build (Recommended)**
```bash
cd mobile
eas build --profile development --platform ios
# or
eas build --profile development --platform android
```

**Option 2: Using Expo Prebuild (Local Development)**
```bash
cd mobile
npx expo prebuild --clean
```

For iOS (after prebuild):
```bash
cd mobile
npx pod-install
cd ios
pod install
```

For Android:
- Open the project in Android Studio
- Build and run from there

#### After Prebuild

After running `expo prebuild`, you'll need to:
1. Build the app using Xcode (iOS) or Android Studio (Android)
2. Or use `npx expo run:ios` / `npx expo run:android`

**Note**: The MapBox plugin in `app.json` will automatically configure the native code during prebuild/build.

### Deprecation Warning

If you see warnings about `RNMapboxMapsDownloadToken` being deprecated:
- This is normal and can be ignored for Expo managed workflow
- The warning appears because MapBox changed how download tokens are configured
- For Expo projects, you only need the `EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN` for runtime API access
- The download token is only needed for bare React Native projects with custom native builds

## Comparing Map Implementations

You now have two map implementations available:

1. **Map** - Uses `react-native-maps` (native) and Leaflet (web)
2. **Map(MapBox)** - Uses `@rnmapbox/maps` (native) and MapBox GL JS (web)

Both implementations provide the same features, allowing you to compare:
- Performance
- Visual quality
- Ease of use
- Bundle size
- Platform compatibility

Choose the implementation that best fits your needs for your development build.

## Additional Resources

- [MapBox Documentation](https://docs.mapbox.com/)
- [MapBox GL JS Documentation](https://docs.mapbox.com/mapbox-gl-js/)
- [@rnmapbox/maps Documentation](https://github.com/rnmapbox/maps)

