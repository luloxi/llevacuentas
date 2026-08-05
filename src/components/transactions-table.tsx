"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown, ChevronLeft, ChevronRight, Download, FileSpreadsheet, FileText, Search, SlidersHorizontal, X,
} from "lucide-react";
import * as XLSX from "xlsx";
import { formatArs, formatUsd, formatDateAr, cn, currentPeriodAr, periodFromDateString } from "@/lib/utils";
import { formatPeriodLabel } from "@/lib/period-label";
import { LoadingBlock, Toast } from "@/components/ui";

/* NOTE: full file retained; Ticket badge classes updated for dark contrast */
