import React from "react";
import { Star } from "lucide-react";
import { useI18n } from "../i18n";

const Watchlist = ({
  items,
  selectedSymbol,
  starredSymbols,
  filter,
  onFilterChange,
  onSymbolSelect,
  onToggleStar,
}) => {
  const { t } = useI18n();

  const MAX_VISIBLE = 10;
  const allFiltered =
    filter === "starred"
      ? items.filter((item) => starredSymbols.includes(item.symbol))
      : items;
  const filteredItems = allFiltered.slice(0, MAX_VISIBLE);

  return (
    <aside className="w-64 bg-gray-800 p-4 rounded-lg overflow-y-auto">
      <h3 className="text-xl font-semibold mb-2 text-blue-400">
        {t("watchlist")}
      </h3>
      <div className="flex gap-1 mb-3">
        <button
          onClick={() => onFilterChange("all")}
          className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
            filter === "all"
              ? "bg-blue-600 text-white"
              : "text-gray-400 hover:text-white hover:bg-gray-700"
          }`}
        >
          {t("all")}
        </button>
        <button
          onClick={() => onFilterChange("starred")}
          className={`flex items-center gap-1 px-3 py-1 rounded text-xs font-medium transition-colors ${
            filter === "starred"
              ? "bg-blue-600 text-white"
              : "text-gray-400 hover:text-white hover:bg-gray-700"
          }`}
        >
          <Star size={10} /> {t("starred")}
        </button>
      </div>
      <ul className="space-y-2">
        {filteredItems.map((item) => {
          const isActive = selectedSymbol === item.symbol;
          const isStarred = starredSymbols.includes(item.symbol);
          return (
            <li
              key={item.symbol}
              className={`flex justify-between items-center p-2 rounded-lg cursor-pointer transition-colors duration-200 ${
                isActive
                  ? "bg-blue-700 ring-1 ring-blue-400"
                  : "bg-gray-700 hover:bg-gray-600"
              }`}
            >
              <div
                className="flex-1"
                onClick={() => onSymbolSelect(item.symbol)}
              >
                <span className="font-medium">{item.symbol}</span>
                <span className="block text-sm text-gray-400">
                  {item.price.toLocaleString()}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleStar(item.symbol);
                  }}
                  className={`p-0.5 transition-colors ${isStarred ? "text-yellow-400" : "text-gray-600 hover:text-gray-400"}`}
                >
                  <Star size={14} fill={isStarred ? "currentColor" : "none"} />
                </button>
                <div
                  className={`flex items-center ${item.color === "green" ? "text-green-400" : "text-red-400"}`}
                >
                  <span>
                    {item.change > 0 ? "+" : ""}
                    {item.change}%
                  </span>
                </div>
              </div>
            </li>
          );
        })}
        {filteredItems.length === 0 && (
          <li className="text-center text-gray-500 text-sm py-4">
            {filter === "starred" ? "No starred symbols" : "No symbols"}
          </li>
        )}
      </ul>
      {allFiltered.length > MAX_VISIBLE && (
        <p className="text-center text-gray-500 text-xs mt-2">
          Showing {MAX_VISIBLE} of {allFiltered.length} symbols
        </p>
      )}
    </aside>
  );
};

export default Watchlist;
