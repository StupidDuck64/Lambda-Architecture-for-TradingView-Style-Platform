import React, { useEffect, useRef } from "react";
import {
  createChart,
  CrosshairMode,
  LineStyle,
  LineSeries,
} from "lightweight-charts";
import { THEME, localTickMarkFormatter } from "./chartConstants";

const OscillatorPane = ({ data, settings, label }) => {
  const ref = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!ref.current || !data || data.length === 0) return;
    const chart = createChart(ref.current, {
      layout: {
        background: { color: "#141620" },
        textColor: THEME.textColor,
        fontSize: 10,
      },
      grid: {
        vertLines: { color: THEME.gridColor },
        horzLines: { color: THEME.gridColor },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: {
        borderColor: THEME.borderColor,
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      timeScale: {
        borderColor: THEME.borderColor,
        timeVisible: true,
        secondsVisible: false,
        tickMarkFormatter: localTickMarkFormatter,
      },
      handleScroll: false,
      handleScale: false,
    });
    const series = chart.addSeries(LineSeries, {
      color: settings.color,
      lineWidth: settings.lineWidth || 1.5,
      priceLineVisible: false,
      lastValueVisible: true,
      crosshairMarkerVisible: true,
    });
    series.setData(data);

    // Overbought / Oversold bands
    if (settings.overbought != null) {
      series.createPriceLine({
        price: settings.overbought,
        color: "#ef444460",
        lineStyle: LineStyle.Dashed,
        lineWidth: 1,
        title: "OB",
        axisLabelVisible: true,
      });
      series.createPriceLine({
        price: settings.oversold,
        color: "#22c55e60",
        lineStyle: LineStyle.Dashed,
        lineWidth: 1,
        title: "OS",
        axisLabelVisible: true,
      });
    }

    chart.timeScale().fitContent();
    chartRef.current = chart;
    const ro = new ResizeObserver(() => {
      if (ref.current)
        chart.resize(ref.current.clientWidth, ref.current.clientHeight);
    });
    ro.observe(ref.current);
    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update data
  useEffect(() => {
    if (!chartRef.current || !data || data.length === 0) return;
    // Re-create series on settings change is handled by unmount/remount via key
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, settings]);

  return (
    <div className="relative border-t border-gray-700" style={{ height: 100 }}>
      <span className="absolute top-1 left-2 text-xs text-gray-400 z-10 pointer-events-none">
        {label}
      </span>
      <div ref={ref} className="w-full h-full" />
    </div>
  );
};

export default OscillatorPane;
