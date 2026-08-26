import { useGeolocation } from '../hooks/useGeolocation'
import { useWeatherPageData } from '../hooks/useWeatherPageData'
import WeatherHero from '../components/weather/WeatherHero'
import HourlyForecastRail from '../components/weather/HourlyForecastRail'
import InstrumentGrid from '../components/weather/InstrumentGrid'
import AirQualityLine from '../components/weather/AirQualityLine'
import WindMinimap from '../components/weather/WindMinimap'
import SourceFooter from '../components/weather/SourceFooter'
import type { WeatherCity } from '../lib/cityCatalog'
import '../styles/weather.css'

/**
 * Weather — /weather. Weather is the star (S1-S3), air quality is a
 * one-line capsule (S4), a local wind minimap (S5), and a sources/freshness
 * footer (S6). Every section shares one `useWeatherPageData` fetch for the
 * current location and degrades independently per field — see
 * `components/weather/sectionState.ts`.
 */
export default function Weather() {
  const { location, requesting, denied, requestLocation, setLocation } = useGeolocation()
  const { status, configured, weather, aq, wind, mslp, fetchedAt, retry } = useWeatherPageData(
    location.lat,
    location.lon,
  )

  function handleSelectCity(city: WeatherCity): void {
    setLocation({ lat: city.lat, lon: city.lon, label: `${city.name}, ${city.countryCode}` })
  }

  return (
    <main className="wx-page">
      <WeatherHero
        location={location}
        requestingLocation={requesting}
        locationDenied={denied}
        onRequestLocation={requestLocation}
        onSelectCity={handleSelectCity}
        status={status}
        configured={configured}
        weather={weather}
        onRetry={retry}
      />

      <div className="wx-shell">
        <HourlyForecastRail status={status} configured={configured} weather={weather} onRetry={retry} />
        <InstrumentGrid status={status} configured={configured} weather={weather} onRetry={retry} />
        <AirQualityLine status={status} configured={configured} aq={aq} onRetry={retry} />
        <WindMinimap
          status={status}
          configured={configured}
          wind={wind}
          mslp={mslp}
          lat={location.lat}
          lon={location.lon}
          onRetry={retry}
        />
        <SourceFooter fetchedAt={fetchedAt} locationSource={location.source} />
      </div>
    </main>
  )
}
