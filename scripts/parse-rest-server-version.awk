BEGIN {
  if (expected == "") exit 2
}

NR == 1 &&
  $1 == "rest-server" &&
  $2 == "version" &&
  $3 == "rest-server" &&
  $4 ~ /^[0-9]+\.[0-9]+\.[0-9]+$/ {
  if ($4 != expected) exit 1
  parsed = $4
  next
}

NR == 1 || NF != 0 {
  invalid = 1
}

END {
  if (parsed == "" || invalid) exit 1
  print parsed
}
