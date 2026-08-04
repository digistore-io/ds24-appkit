# Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
# SPDX-License-Identifier: MIT

# An alias, nothing more.
#
# The commands of this app live in run.mjs, because that one runs on Linux,
# macOS and Windows alike — `make` does not (it is missing on Windows and needs
# the Xcode Command Line Tools on macOS). See CLAUDE.md → Three systems.
#
#   node run.mjs              show every command
#   node run.mjs start        database + migrations + app
#   node run.mjs stop         stop everything
#
# This file only exists so that `make start` keeps working for whoever has make
# and is used to it. Every target is forwarded; arguments go through ARGS:
#
#   make start
#   make ds24-sync ARGS=--dry-run
#
# Do not add targets here. They belong in run.mjs, otherwise Windows loses them.

ARGS ?=

# `make ds24-sync ENV=prod` — shorthand for `--env prod`: which environment's
# Digistore24 product set a sync maintains (dev | staging | prod).
ifneq ($(ENV),)
ARGS += --env $(ENV)
endif

.DEFAULT_GOAL := help

.PHONY: help
help:
	@node run.mjs help

# Catch-all: every other target goes to the runner unchanged.
%:
	@node run.mjs $@ $(ARGS)
