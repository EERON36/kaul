#!/usr/bin/env perl

use strict;
use warnings;

use Fcntl qw(:DEFAULT :mode);
use File::Basename qw(dirname);
use Socket qw(AF_INET inet_ntop inet_pton);

my $expected_owner = 0;
my $test_owner = 0;
if (@ARGV && $ARGV[0] eq q{--expected-owner-current}) {
  shift @ARGV;
  $expected_owner = $<;
  $test_owner = 1;
}

@ARGV == 1 or die "ERROR: Gate C policy validator requires one policy path.\n";
my ($path) = @ARGV;

($ENV{KAUL_GATE_C_INGRESS_MODE} // q{}) eq q{npm}
  or die "ERROR: Installed Gate C policy requires PILOT_INGRESS_MODE=npm.\n";

my $directory = dirname($path);
while (1) {
  my @directory_stat = lstat($directory);
  @directory_stat && S_ISDIR($directory_stat[2])
    or die "ERROR: Every Gate C policy parent must be a directory.\n";
  $directory_stat[4] == $expected_owner
    or die "ERROR: Gate C policy parents must have the expected owner.\n";
  ($directory_stat[2] & 0022) == 0
    or die "ERROR: Gate C policy parents must not be group- or other-writable.\n";
  last if $test_owner || $directory eq q{/};
  $directory = dirname($directory);
}

sysopen(my $file, $path, O_RDONLY | O_NOFOLLOW | O_NONBLOCK)
  or die "ERROR: Gate C policy must be readable and not a symlink.\n";
my @stat = stat($file);
S_ISREG($stat[2]) && $stat[4] == $expected_owner && ($stat[2] & 07777) == 0644
  or die "ERROR: Gate C policy must be root-owned, regular, and mode 0644.\n";

my %allowed = map { $_ => 1 } qw(
  COMPOSE_PROJECT_NAME
  PILOT_ENV_FILE
  INGRESS_INTERFACE
  HOST_IPV4_CIDR
  TRUSTED_NPM_IPV4
  PUBLISHED_TCP_PORT
);
my %values;
while (my $line = <$file>) {
  chomp $line;
  $line =~ /[\r\0]/
    and die "ERROR: Gate C policy contains a forbidden control character.\n";
  next if $line eq q{} || $line =~ /^#/;
  $line =~ /^([A-Z][A-Z0-9_]*)=(.*)$/
    or die "ERROR: Gate C policy must use KEY=VALUE syntax.\n";
  my ($key, $value) = ($1, $2);
  $allowed{$key} or die "ERROR: Unknown Gate C policy key: $key\n";
  !exists $values{$key} or die "ERROR: Duplicate Gate C policy key: $key\n";
  $values{$key} = $value;
}
for my $key (keys %allowed) {
  exists $values{$key} && length $values{$key}
    or die "ERROR: Missing Gate C policy key: $key\n";
}

my ($host, $prefix) = $values{HOST_IPV4_CIDR} =~ /\A([^\/]+)\/(\d{1,2})\z/;
defined $host or die "ERROR: Gate C HOST_IPV4_CIDR is malformed.\n";
$prefix = 0 + $prefix;
$prefix >= 1 && $prefix <= 32
  or die "ERROR: Gate C HOST_IPV4_CIDR prefix is invalid.\n";
my $host_packed = inet_pton(AF_INET, $host);
defined $host_packed && inet_ntop(AF_INET, $host_packed) eq $host
  or die "ERROR: Gate C HOST_IPV4_CIDR must contain canonical IPv4.\n";

$values{COMPOSE_PROJECT_NAME} =~ /\A[a-z][a-z0-9_-]{0,62}\z/
  or die "ERROR: Gate C COMPOSE_PROJECT_NAME is invalid.\n";
$values{PILOT_ENV_FILE} =~ /\A\/[A-Za-z0-9._\/-]+\z/
  or die "ERROR: Gate C PILOT_ENV_FILE must be a simple absolute path.\n";
$values{INGRESS_INTERFACE} =~ /\A[A-Za-z0-9][A-Za-z0-9_.:-]{0,14}\z/
  or die "ERROR: Gate C INGRESS_INTERFACE is invalid.\n";

my $npm_ip = $values{TRUSTED_NPM_IPV4};
my $npm_packed = inet_pton(AF_INET, $npm_ip);
defined $npm_packed && inet_ntop(AF_INET, $npm_packed) eq $npm_ip
  or die "ERROR: Gate C TRUSTED_NPM_IPV4 must be canonical IPv4.\n";
$npm_ip ne $host or die "ERROR: Gate C host and NPM addresses must differ.\n";
my $host_number = unpack(q{N}, $host_packed);
my $npm_number = unpack(q{N}, $npm_packed);
my $mask = (0xffffffff << (32 - $prefix)) & 0xffffffff;
($host_number & $mask) == ($npm_number & $mask)
  or die "ERROR: Gate C host and NPM addresses must share the configured network.\n";
for my $address ($host_number, $npm_number) {
  ($address & 0xff000000) == 0x0a000000
    || ($address & 0xfff00000) == 0xac100000
    || ($address & 0xffff0000) == 0xc0a80000
    or die "ERROR: Gate C addresses must use RFC1918 private IPv4.\n";
}
$values{PUBLISHED_TCP_PORT} =~ /\A\d{4,5}\z/
  or die "ERROR: Gate C PUBLISHED_TCP_PORT is malformed.\n";
my $port = 0 + $values{PUBLISHED_TCP_PORT};
$port >= 1024 && $port <= 65535 && $port != 3000 && $port != 5432
  or die "ERROR: Gate C PUBLISHED_TCP_PORT is unsafe or invalid.\n";
my %expected = (
  COMPOSE_PROJECT_NAME => $ENV{KAUL_GATE_C_PROJECT} // q{},
  PILOT_ENV_FILE => $ENV{KAUL_GATE_C_ENV_FILE} // q{},
  PILOT_CADDY_PRIVATE_BIND => $ENV{KAUL_GATE_C_BIND} // q{},
  PILOT_NPM_TRUSTED_PROXY_CIDR => ($ENV{KAUL_GATE_C_PROXY} // q{}) . q{/32},
);
my %actual = (
  COMPOSE_PROJECT_NAME => $values{COMPOSE_PROJECT_NAME},
  PILOT_ENV_FILE => $values{PILOT_ENV_FILE},
  PILOT_CADDY_PRIVATE_BIND => $host . q{:} . $values{PUBLISHED_TCP_PORT},
  PILOT_NPM_TRUSTED_PROXY_CIDR => $values{TRUSTED_NPM_IPV4} . q{/32},
);
for my $key (sort keys %expected) {
  $actual{$key} eq $expected{$key}
    or die "ERROR: Pilot $key does not match installed Gate C policy.\n";
}
