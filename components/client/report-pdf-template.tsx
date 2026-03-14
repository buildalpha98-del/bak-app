import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 10,
    color: "#1A1A1A",
    paddingTop: 0,
    paddingBottom: 40,
    paddingHorizontal: 0,
  },
  // Header
  headerBar: {
    backgroundColor: "#E8712A",
    height: 8,
    width: "100%",
  },
  headerContent: {
    paddingHorizontal: 40,
    paddingTop: 20,
    paddingBottom: 20,
    backgroundColor: "#FAFAFA",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  companyName: {
    fontSize: 20,
    fontFamily: "Helvetica-Bold",
    color: "#E8712A",
    letterSpacing: 0.5,
  },
  reportLabel: {
    fontSize: 10,
    color: "#666666",
    marginTop: 2,
  },
  centreName: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    color: "#1A1A1A",
    marginTop: 8,
  },
  termName: {
    fontSize: 10,
    color: "#666666",
    marginTop: 2,
  },
  // Body
  body: {
    paddingHorizontal: 40,
    paddingTop: 24,
  },
  // Sections
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    color: "#E8712A",
    borderBottomWidth: 1,
    borderBottomColor: "#E8712A",
    paddingBottom: 4,
    marginBottom: 10,
  },
  // Summary
  summaryText: {
    fontSize: 10,
    color: "#374151",
    lineHeight: 1.6,
  },
  // Stats row
  statsRow: {
    flexDirection: "row",
    gap: 12,
  },
  statBox: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 6,
    padding: 12,
    alignItems: "center",
  },
  statValue: {
    fontSize: 22,
    fontFamily: "Helvetica-Bold",
    color: "#E8712A",
  },
  statLabel: {
    fontSize: 9,
    color: "#666666",
    marginTop: 3,
    textAlign: "center",
  },
  // Sports
  sportsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  sportBadge: {
    borderWidth: 1,
    borderColor: "#E8712A",
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  sportText: {
    fontSize: 9,
    color: "#E8712A",
    fontFamily: "Helvetica-Bold",
  },
  // Highlights
  highlightItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 6,
    gap: 6,
  },
  bullet: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#E8712A",
    marginTop: 3,
  },
  highlightText: {
    fontSize: 10,
    color: "#374151",
    flex: 1,
    lineHeight: 1.5,
  },
  // Footer
  footer: {
    position: "absolute",
    bottom: 16,
    left: 40,
    right: 40,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    paddingTop: 8,
  },
  footerText: {
    fontSize: 8,
    color: "#9CA3AF",
  },
});

interface ReportPdfProps {
  report: {
    centreName: string;
    termName: string;
    summary: string;
    sessionsDelivered: number;
    averageRating: number;
    sportsCovered: string[];
    highlights: string[];
    generatedAt: string;
  };
}

export function ReportPdfDocument({ report }: ReportPdfProps) {
  return (
    <Document
      title={`Build Alpha Kids — ${report.centreName} — ${report.termName}`}
      author="Build Alpha Kids"
      subject="Term Report"
    >
      <Page size="A4" style={styles.page}>
        {/* Orange accent bar at top */}
        <View style={styles.headerBar} />

        {/* Header content */}
        <View style={styles.headerContent}>
          <Text style={styles.companyName}>Build Alpha Kids</Text>
          <Text style={styles.reportLabel}>Term Report</Text>
          <Text style={styles.centreName}>{report.centreName}</Text>
          <Text style={styles.termName}>{report.termName}</Text>
        </View>

        {/* Body */}
        <View style={styles.body}>
          {/* Executive Summary */}
          {report.summary ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Executive Summary</Text>
              <Text style={styles.summaryText}>{report.summary}</Text>
            </View>
          ) : null}

          {/* Key Stats */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Key Statistics</Text>
            <View style={styles.statsRow}>
              <View style={styles.statBox}>
                <Text style={styles.statValue}>{report.sessionsDelivered}</Text>
                <Text style={styles.statLabel}>Sessions Delivered</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statValue}>
                  {report.averageRating.toFixed(1)}
                </Text>
                <Text style={styles.statLabel}>Average Rating (out of 5)</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statValue}>{report.sportsCovered.length}</Text>
                <Text style={styles.statLabel}>Sports Covered</Text>
              </View>
            </View>
          </View>

          {/* Sports Covered */}
          {report.sportsCovered.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Sports Covered</Text>
              <View style={styles.sportsWrap}>
                {report.sportsCovered.map((sport) => (
                  <View key={sport} style={styles.sportBadge}>
                    <Text style={styles.sportText}>{sport}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {/* Highlights */}
          {report.highlights.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Highlights</Text>
              {report.highlights.map((highlight, i) => (
                <View key={i} style={styles.highlightItem}>
                  <View style={styles.bullet} />
                  <Text style={styles.highlightText}>{highlight}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>
            Generated by Build Alpha Kids · buildalphakids.com.au
          </Text>
          <Text style={styles.footerText}>{report.generatedAt}</Text>
        </View>
      </Page>
    </Document>
  );
}
