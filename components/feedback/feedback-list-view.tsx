"use client";

import { useState, useTransition, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Star, Filter, ChevronLeft, ChevronRight } from "lucide-react";
import { getFeedbackList } from "@/lib/feedback/actions";
import type { FeedbackListItem, FeedbackListFilters } from "@/lib/feedback/actions";

interface FeedbackListViewProps {
  initialData: FeedbackListItem[];
  totalCount: number;
}

const PAGE_SIZE = 20;

const RATING_OPTIONS = [
  { label: "All Ratings", value: 0 },
  { label: "1 Star", value: 1 },
  { label: "2 Stars", value: 2 },
  { label: "3 Stars", value: 3 },
  { label: "4 Stars", value: 4 },
  { label: "5 Stars", value: 5 },
];

function StarDisplay({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={`w-3.5 h-3.5 ${
            star <= rating
              ? rating <= 2
                ? "fill-red-500 text-red-500"
                : "fill-[#E8712A] text-[#E8712A]"
              : "text-gray-300"
          }`}
        />
      ))}
    </div>
  );
}

export function FeedbackListView({ initialData, totalCount }: FeedbackListViewProps) {
  const [data, setData] = useState<FeedbackListItem[]>(initialData);
  const [total, setTotal] = useState(totalCount);
  const [page, setPage] = useState(1);
  const [ratingFilter, setRatingFilter] = useState(0);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [searchText, setSearchText] = useState("");
  const [isPending, startTransition] = useTransition();

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const fetchData = useCallback(
    (filters: {
      page: number;
      rating: number;
      dateFrom: string;
      dateTo: string;
    }) => {
      startTransition(async () => {
        const params: FeedbackListFilters = {
          page: filters.page,
          pageSize: PAGE_SIZE,
        };
        if (filters.rating > 0) {
          params.minRating = filters.rating;
          params.maxRating = filters.rating;
        }
        if (filters.dateFrom) params.dateFrom = filters.dateFrom;
        if (filters.dateTo) params.dateTo = filters.dateTo;

        const result = await getFeedbackList(params);
        setData(result.data ?? []);
        setTotal(result.total);
      });
    },
    []
  );

  const handleRatingChange = (value: number) => {
    setRatingFilter(value);
    setPage(1);
    fetchData({ page: 1, rating: value, dateFrom, dateTo });
  };

  const handleDateFromChange = (value: string) => {
    setDateFrom(value);
    setPage(1);
    fetchData({ page: 1, rating: ratingFilter, dateFrom: value, dateTo });
  };

  const handleDateToChange = (value: string) => {
    setDateTo(value);
    setPage(1);
    fetchData({ page: 1, rating: ratingFilter, dateFrom, dateTo: value });
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    fetchData({ page: newPage, rating: ratingFilter, dateFrom, dateTo });
  };

  const handleClearFilters = () => {
    setRatingFilter(0);
    setDateFrom("");
    setDateTo("");
    setSearchText("");
    setPage(1);
    fetchData({ page: 1, rating: 0, dateFrom: "", dateTo: "" });
  };

  // Client-side text filter on centre/coach name
  const filteredData = searchText
    ? data.filter(
        (item) =>
          item.centre.name.toLowerCase().includes(searchText.toLowerCase()) ||
          (item.coach?.name ?? "").toLowerCase().includes(searchText.toLowerCase())
      )
    : data;

  const hasActiveFilters = ratingFilter > 0 || dateFrom || dateTo || searchText;

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-AU", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  return (
    <Card>
      <CardContent>
        {/* Filter bar */}
        <div className="flex flex-wrap items-end gap-3 mb-4">
          <div>
            <label className="block text-xs text-[#666666] mb-1">Rating</label>
            <select
              value={ratingFilter}
              onChange={(e) => handleRatingChange(Number(e.target.value))}
              className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/50"
            >
              {RATING_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-[#666666] mb-1">From</label>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => handleDateFromChange(e.target.value)}
              className="h-8 w-36"
            />
          </div>

          <div>
            <label className="block text-xs text-[#666666] mb-1">To</label>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => handleDateToChange(e.target.value)}
              className="h-8 w-36"
            />
          </div>

          <div>
            <label className="block text-xs text-[#666666] mb-1">
              Centre / Coach
            </label>
            <Input
              type="text"
              placeholder="Search..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="h-8 w-48"
            />
          </div>

          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearFilters}
              className="text-[#666666] h-8"
            >
              <Filter className="w-3.5 h-3.5 mr-1" />
              Clear
            </Button>
          )}
        </div>

        {/* Table */}
        <div className={isPending ? "opacity-60 pointer-events-none" : ""}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Centre</TableHead>
                <TableHead>Coach</TableHead>
                <TableHead>Sport</TableHead>
                <TableHead>Rating</TableHead>
                <TableHead className="min-w-[200px]">Comment</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredData.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-[#666666] py-8">
                    No feedback found.
                  </TableCell>
                </TableRow>
              ) : (
                filteredData.map((item) => (
                  <TableRow
                    key={item.id}
                    className={item.rating <= 2 ? "bg-red-50" : ""}
                  >
                    <TableCell className="text-[#1A1A1A]">
                      {formatDate(item.submitted_at)}
                    </TableCell>
                    <TableCell className="text-[#1A1A1A]">
                      {item.centre.name}
                    </TableCell>
                    <TableCell className="text-[#1A1A1A]">
                      {item.coach?.name ?? "—"}
                    </TableCell>
                    <TableCell className="text-[#666666]">
                      {item.sport ?? "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <StarDisplay rating={item.rating} />
                        <span
                          className={`text-xs font-medium ${
                            item.rating <= 2 ? "text-red-600" : "text-[#666666]"
                          }`}
                        >
                          {item.rating}/5
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <p className="text-[#666666] truncate max-w-[300px]">
                        {item.comment ?? "—"}
                      </p>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4">
            <p className="text-sm text-[#666666]">
              Showing {(page - 1) * PAGE_SIZE + 1}–
              {Math.min(page * PAGE_SIZE, total)} of {total}
            </p>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1 || isPending}
                onClick={() => handlePageChange(page - 1)}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="px-2 text-sm text-[#1A1A1A]">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages || isPending}
                onClick={() => handlePageChange(page + 1)}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
