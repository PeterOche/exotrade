'use client';

import { useEffect, useRef } from 'react';
import { createChart, type IChartApi, type ISeriesApi, ColorType, CandlestickSeries } from 'lightweight-charts';
import { extendedApi } from '@exotrade/core';

interface ChartPanelProps {
    market: string;
}

export function ChartPanel({ market }: ChartPanelProps) {
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<IChartApi | null>(null);
    const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);

    useEffect(() => {
        if (!chartContainerRef.current) return;

        // Create chart with pro configuration
        const chart = createChart(chartContainerRef.current, {
            layout: {
                background: { type: ColorType.Solid, color: '#09090b' },
                textColor: '#71717a', // zinc-500
                fontFamily: 'Inter, sans-serif',
            },
            grid: {
                vertLines: { color: '#18181b' }, // zinc-900
                horzLines: { color: '#18181b' },
            },
            crosshair: {
                mode: 1, // CrosshairMode.Normal
                vertLine: {
                    width: 1,
                    color: '#27272a',
                    style: 3, // LineStyle.Dashed
                    labelBackgroundColor: '#27272a',
                },
                horzLine: {
                    width: 1,
                    color: '#27272a',
                    style: 3,
                    labelBackgroundColor: '#27272a',
                },
            },
            rightPriceScale: {
                borderColor: '#27272a',
                autoScale: true,
                scaleMargins: {
                    top: 0.1,
                    bottom: 0.1,
                },
            },
            timeScale: {
                borderColor: '#27272a',
                timeVisible: true,
                rightOffset: 12,
                barSpacing: 6,
                fixLeftEdge: true,
                lockVisibleTimeRangeOnResize: true,
                rightBarStaysOnScroll: true,
            },
            handleScroll: {
                mouseWheel: true,
                pressedMouseMove: true,
            },
            handleScale: {
                axisPressedMouseMove: true,
                mouseWheel: true,
                pinch: true,
            },
        });

        chartRef.current = chart;

        // Create candlestick series (v5 API)
        const candleSeries = chart.addSeries(CandlestickSeries, {
            upColor: '#22c55e', // green-500
            downColor: '#ef4444', // red-500
            borderDownColor: '#ef4444',
            borderUpColor: '#22c55e',
            wickDownColor: '#ef4444',
            wickUpColor: '#22c55e',
        });

        candleSeriesRef.current = candleSeries;

        // Handle resize
        const handleResize = () => {
            if (chartContainerRef.current) {
                chart.applyOptions({
                    width: chartContainerRef.current.clientWidth,
                    height: chartContainerRef.current.clientHeight,
                });
            }
        };

        window.addEventListener('resize', handleResize);
        handleResize();

        // Fetch candle data
        const fetchCandles = async () => {
            try {
                const candles = await extendedApi.getCandles(market, 'trades', '1h', 200);
                if (candles && candleSeriesRef.current) {
                    const formattedCandles = candles
                        .map((c) => ({
                            time: Math.floor(c.T / 1000) as import('lightweight-charts').Time,
                            open: parseFloat(c.o),
                            high: parseFloat(c.h),
                            low: parseFloat(c.l),
                            close: parseFloat(c.c),
                        }))
                        // Sort ascending by time (API returns descending)
                        .sort((a, b) => (a.time as number) - (b.time as number));

                    candleSeriesRef.current.setData(formattedCandles);

                    // Fit content to show all data nicely
                    chart.timeScale().fitContent();
                }
            } catch (error) {
                console.error('Failed to fetch candles:', error);
            }
        };

        fetchCandles();

        return () => {
            window.removeEventListener('resize', handleResize);
            chart.remove();
        };
    }, [market]);

    return (
        <div className="h-full flex flex-col">
            <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">Chart</span>
                    <span className="text-xs text-zinc-500">1H</span>
                </div>
            </div>
            <div
                ref={chartContainerRef}
                className="flex-1 min-h-0"
                style={{ minHeight: '300px' }}
            />
        </div>
    );
}
