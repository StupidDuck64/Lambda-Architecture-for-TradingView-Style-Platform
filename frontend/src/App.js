import React, { useState, useCallback, useEffect } from "react";
import CandlestickChart from "./components/CandlestickChart";
import DrawingToolbar from "./components/DrawingToolbar";
import ChartOverlay from "./components/ChartOverlay";
import Header from "./components/Header";
import Watchlist from "./components/Watchlist";
import { DEFAULT_TOOL_SETTINGS } from "./components/ToolSettingsPopup";
import { fetchTickers, fetchSymbols } from "./services/marketDataService";
import { loadFromStorage, saveToStorage } from "./utils/storageHelpers";

const FALLBACK_SYMBOLS = [
  "BTCUSDT",
  "ETHUSDT",
  "BNBUSDT",
  "SOLUSDT",
  "XRPUSDT",
  "DOGEUSDT",
  "ADAUSDT",
  "AVAXUSDT",
];

function buildWatchlist(symbolNames) {
  return symbolNames.map((s) => ({
    symbol: s,
    price: 0,
    change: 0,
    color: "gray",
  }));
}

const TradingDashboard = () => {
  const [activeTool, setActiveTool] = useState("cursor");
  const [drawings, setDrawings] = useState([]);
  const [selectedSymbol, setSelectedSymbol] = useState(() => {
    const stored = loadFromStorage("app_selectedSymbol", "BTCUSDT");
    // Migrate legacy symbol names (e.g. BTCUSD → BTCUSDT)
    if (stored && !stored.endsWith("USDT")) return "BTCUSDT";
    return stored;
  });
  const [toolSettings, setToolSettings] = useState(() =>
    loadFromStorage(
      "app_toolSettings",
      JSON.parse(JSON.stringify(DEFAULT_TOOL_SETTINGS)),
    ),
  );
  const [starredSymbols, setStarredSymbols] = useState(() =>
    loadFromStorage("app_starred", []),
  );
  const [watchlistFilter, setWatchlistFilter] = useState("all"); // 'all' | 'starred'
  const [symbols, setSymbols] = useState(FALLBACK_SYMBOLS);
  const [watchlistItems, setWatchlistItems] = useState(() =>
    buildWatchlist(FALLBACK_SYMBOLS),
  );
  const [showNavDrawer, setShowNavDrawer] = useState(false);
  const [connError, setConnError] = useState(false);

  // Load available symbols from backend on mount
  useEffect(() => {
    fetchSymbols()
      .then((list) => {
        const names = list.map((s) => s.symbol);
        if (names.length > 0) {
          setSymbols(names);
          setWatchlistItems(buildWatchlist(names));
        }
        setConnError(false);
      })
      .catch(() => {
        setConnError(true);
      });
  }, []);

  // Fetch live ticker prices for the watchlist
  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      fetchTickers()
        .then((tickers) => {
          if (cancelled) return;
          const map = {};
          tickers.forEach((t) => {
            map[t.symbol] = t;
          });
          setWatchlistItems((prev) =>
            prev.map((item) => {
              const tick = map[item.symbol];
              if (!tick) return item;
              // Compute 24h change % if volume is available, otherwise keep last value
              return {
                ...item,
                price: tick.price,
                change: tick.change24h != null ? tick.change24h : item.change,
                color:
                  tick.price > 0
                    ? tick.change24h >= 0
                      ? "green"
                      : "red"
                    : item.color,
              };
            }),
          );
        })
        .catch(() => {
          if (!cancelled) setConnError(true);
        });
    };
    refresh();
    const id = setInterval(refresh, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // Persist settings to localStorage
  useEffect(() => {
    saveToStorage("app_toolSettings", toolSettings);
  }, [toolSettings]);
  useEffect(() => {
    saveToStorage("app_starred", starredSymbols);
  }, [starredSymbols]);
  useEffect(() => {
    saveToStorage("app_selectedSymbol", selectedSymbol);
  }, [selectedSymbol]);

  const handleAddDrawing = useCallback(
    (d) => setDrawings((prev) => [...prev, d]),
    [],
  );
  const handleClearAll = useCallback(() => {
    setDrawings([]);
    setActiveTool("cursor");
  }, []);
  const handleSymbolSelect = useCallback((symbol) => {
    setSelectedSymbol(symbol);
    setDrawings([]);
  }, []);
  const handleToolSettingsChange = useCallback((toolId, newSettings) => {
    setToolSettings((prev) => ({ ...prev, [toolId]: newSettings }));
  }, []);

  const handleToggleStar = useCallback((symbol) => {
    setStarredSymbols((prev) =>
      prev.includes(symbol)
        ? prev.filter((s) => s !== symbol)
        : [...prev, symbol],
    );
  }, []);

  return (
    <div className="bg-gray-900 text-white min-h-screen font-sans flex flex-col">
      <Header showNavDrawer={showNavDrawer} onToggleDrawer={setShowNavDrawer} />

      {connError && (
        <div className="px-4 py-2 bg-red-900/50 border-b border-red-700/50 flex items-center justify-between">
          <span className="text-xs text-red-300">
            Unable to connect to server — showing cached/fallback data
          </span>
          <button
            onClick={() => {
              setConnError(false);
              fetchSymbols()
                .then((list) => {
                  const names = list.map((s) => s.symbol);
                  if (names.length > 0) {
                    setSymbols(names);
                    setWatchlistItems(buildWatchlist(names));
                  }
                })
                .catch(() => setConnError(true));
            }}
            className="text-xs text-red-300 hover:text-white underline ml-4"
          >
            Retry
          </button>
        </div>
      )}

      <main className="flex-grow p-6 overflow-hidden flex">
        {/* Drawing Toolbar */}
        <div className="mr-3 flex-shrink-0">
          <DrawingToolbar
            activeTool={activeTool}
            onToolChange={setActiveTool}
            onClearAll={handleClearAll}
            toolSettings={toolSettings}
            onToolSettingsChange={handleToolSettingsChange}
          />
        </div>

        <div className="flex-grow mr-4 flex flex-col">
          <div
            className="bg-gray-900 rounded-lg shadow-lg flex-grow"
            style={{ minHeight: 0 }}
          >
            <CandlestickChart
              symbol={selectedSymbol}
              symbols={symbols}
              starredSymbols={starredSymbols}
              onToggleStar={handleToggleStar}
              onSymbolChange={handleSymbolSelect}
            >
              <ChartOverlay
                activeTool={activeTool}
                drawings={drawings}
                onAddDrawing={handleAddDrawing}
                toolSettings={toolSettings}
              />
            </CandlestickChart>
          </div>
        </div>

        <Watchlist
          items={watchlistItems}
          selectedSymbol={selectedSymbol}
          starredSymbols={starredSymbols}
          filter={watchlistFilter}
          onFilterChange={setWatchlistFilter}
          onSymbolSelect={handleSymbolSelect}
          onToggleStar={handleToggleStar}
        />
      </main>
    </div>
  );
};

export default TradingDashboard;
